"""HTTP API and static pages of the agent console.

Everything here is glue: the pipeline, the speech providers and the feedback log are separate,
tested modules. `create_app` takes its dependencies as arguments so tests run fully offline.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from copilot.kb import DEFAULT_KB_DIR
from copilot.llm import DEFAULT_MODEL, FakeProvider, LLMProvider, OpenAIProvider, load_dotenv
from copilot.models import Ticket, TriageResult
from copilot.pipeline import Copilot
from copilot.prompts import PROMPT_VERSION
from copilot.voice import FakeSpeech, OpenAISpeech, SpeechError, SpeechProvider

ROOT = Path(__file__).resolve().parent.parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
MAX_AUDIO_BYTES = 10 * 1024 * 1024
AUDIO_EXTENSIONS = {".webm", ".mp3", ".wav", ".m4a", ".ogg"}
MAX_TICKET_CHARS = 5000
MULTIPART_OVERHEAD = 64 * 1024
SPEECH_DOWN = "speech service unavailable"
log = logging.getLogger(__name__)


class TriageRequest(BaseModel):
    text: str = Field(max_length=MAX_TICKET_CHARS)
    id: str | None = None

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be empty")
        return v


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    language: str = "en"


class FeedbackRequest(BaseModel):
    ticket_id: str = Field(max_length=100)
    input_sha256: str = Field(max_length=64, pattern=r"^[0-9a-fA-F]{1,64}$")
    route: str = Field(max_length=40)
    action: Literal["sent_as_is", "edited", "rejected"]
    final_text: str | None = Field(default=None, max_length=10000)


def _wants_openai(env_value: str | None) -> bool:
    if env_value in {"openai", "fake"}:
        return env_value == "openai"
    return bool(os.environ.get("OPENAI_API_KEY"))


def default_provider() -> LLMProvider:
    load_dotenv()
    if _wants_openai(os.environ.get("COPILOT_PROVIDER")):
        return OpenAIProvider(model=os.environ.get("COPILOT_MODEL", DEFAULT_MODEL))
    return FakeProvider()


def default_speech() -> SpeechProvider:
    load_dotenv()
    if _wants_openai(os.environ.get("COPILOT_PROVIDER")):
        return OpenAISpeech()
    return FakeSpeech()


def _read_jsonl(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    rows: list[object] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue  # a torn or foreign line must not break the stats
    return [r for r in rows if isinstance(r, dict)]


def _samples(eval_dir: Path) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for name, group in (("tickets.jsonl", "core"), ("tickets_real.jsonl", "real_themes")):
        for r in _read_jsonl(eval_dir / name):
            out.append(
                {
                    "id": str(r.get("id", "")),
                    "text": str(r.get("text", "")),
                    "language": str(r.get("language", "")),
                    "label": f"{r.get('route', '')} · {r.get('category', '')}",
                    "group": group,
                }
            )
    return out


def _kb_payload(copilot: Copilot, kb_dir: Path) -> dict[str, object]:
    pages: dict[str, dict[str, object]] = {}
    for chunk in copilot.index.chunks:
        page = pages.get(chunk.page)
        if page is None:
            md = kb_dir / f"{chunk.page}.md"
            m = (
                re.search(r"^# (.+)$", md.read_text(encoding="utf-8"), re.M)
                if md.exists()
                else None
            )
            page = {
                "slug": chunk.page,
                "url": chunk.url,
                "title": m.group(1).strip() if m else chunk.page,
                "chunks": [],
            }
            pages[chunk.page] = page
        chunks = page["chunks"]
        assert isinstance(chunks, list)
        chunks.append({"id": chunk.id, "heading": chunk.heading, "text": chunk.text})
    return {"version": copilot.kb_version, "pages": list(pages.values())}


def create_app(
    provider: LLMProvider | None = None,
    speech: SpeechProvider | None = None,
    data_dir: Path | None = None,
    static_dir: Path | None = None,
    kb_dir: Path = DEFAULT_KB_DIR,
    eval_dir: Path | None = None,
) -> FastAPI:
    provider = provider or default_provider()
    if speech is None:
        # An explicit fake LLM must never pull in the paid speech API.
        speech = FakeSpeech() if isinstance(provider, FakeProvider) else default_speech()
    data_dir = data_dir or ROOT / "data"
    static_dir = static_dir or STATIC_DIR
    eval_dir = eval_dir or ROOT / "eval"
    copilot = Copilot(provider, kb_dir)
    feedback_path = data_dir / "feedback.jsonl"
    lock = threading.Lock()

    app = FastAPI(title="Support co-pilot")

    @app.middleware("http")
    async def limit_voice_upload(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Checked before the multipart body is parsed (and spooled to disk).
        if request.url.path == "/api/voice" and request.method == "POST":
            length = request.headers.get("content-length")
            if length is None:
                return JSONResponse({"detail": "Content-Length required"}, status_code=411)
            if not length.isdigit() or int(length) > MAX_AUDIO_BYTES + MULTIPART_OVERHEAD:
                return JSONResponse({"detail": "audio is larger than 10 MB"}, status_code=413)
        return await call_next(request)

    def page(name: str) -> FileResponse:
        path = static_dir / name
        if not path.is_file():
            raise HTTPException(status_code=404, detail=f"{name} not found")
        return FileResponse(path)

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return page("index.html")

    @app.get("/business-case", include_in_schema=False)
    def business_case() -> FileResponse:
        return page("business-case.html")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {
            "provider": "fake" if isinstance(provider, FakeProvider) else "openai",
            "model": provider.model,
            "speech": speech.name,
            "kb_version": copilot.kb_version,
            "prompt_version": PROMPT_VERSION,
        }

    @app.get("/api/samples")
    def samples() -> list[dict[str, str]]:
        return _samples(eval_dir)

    @app.get("/api/kb")
    def kb() -> dict[str, object]:
        return _kb_payload(copilot, kb_dir)

    @app.post("/api/triage")
    def triage(req: TriageRequest) -> dict[str, object]:
        ticket = Ticket(id=req.id or "adhoc", text=req.text)
        return copilot.triage(ticket).model_dump(mode="json")

    @app.post("/api/voice")
    def voice(
        audio: UploadFile = File(...),  # noqa: B008
        language: str | None = Form(None),
    ) -> dict[str, object]:
        name = audio.filename or "audio.webm"
        if Path(name).suffix.lower() not in AUDIO_EXTENSIONS:
            raise HTTPException(422, f"unsupported audio type, use {sorted(AUDIO_EXTENSIONS)}")
        data = audio.file.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "audio is larger than 10 MB")
        if not data:
            raise HTTPException(422, "audio file is empty")
        try:
            transcript = speech.transcribe(data, name, language or None)
        except SpeechError as exc:
            log.error("speech error: %s", exc)
            raise HTTPException(503, SPEECH_DOWN) from exc
        text = transcript.text.strip()
        if not text:
            raise HTTPException(422, "no speech recognised in the audio")
        sha = hashlib.sha256(data).hexdigest()
        result: TriageResult = copilot.triage(
            Ticket(id=f"voice-{sha[:8]}", text=text[:MAX_TICKET_CHARS])
        )
        return {
            "transcript": transcript.model_dump(mode="json"),
            "result": result.model_dump(mode="json"),
        }

    @app.post("/api/tts")
    def tts(req: TtsRequest) -> Response:
        try:
            audio = speech.synthesize(req.text, req.language)
        except SpeechError as exc:
            log.error("speech error: %s", exc)
            raise HTTPException(503, SPEECH_DOWN) from exc
        return Response(content=audio, media_type="audio/mpeg")

    @app.post("/api/feedback")
    def feedback(req: FeedbackRequest) -> dict[str, bool]:
        row = {"ts": datetime.now(UTC).isoformat(timespec="seconds"), **req.model_dump()}
        with lock:
            data_dir.mkdir(parents=True, exist_ok=True)
            with feedback_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        return {"ok": True}

    @app.get("/api/feedback/stats")
    def feedback_stats() -> dict[str, int]:
        with lock:
            rows = _read_jsonl(feedback_path)
        counts = {
            k: sum(1 for r in rows if r.get("action") == k)
            for k in ("sent_as_is", "edited", "rejected")
        }
        return {"total": len(rows), **counts}

    if static_dir.is_dir():
        app.mount("/static", StaticFiles(directory=static_dir), name="static")
    return app
