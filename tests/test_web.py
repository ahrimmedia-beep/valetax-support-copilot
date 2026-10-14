"""API tests with the offline fake provider and fake speech: no network, no key."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from copilot.llm import FakeProvider
from copilot.voice import FakeSpeech, SpeechError, Transcript
from copilot.web.app import create_app

STEPS = ["guardrails", "redaction", "classify", "retrieve", "draft", "verify", "route"]


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<h1>console</h1>")
    (static / "app.js").write_text("// js")
    app = create_app(
        FakeProvider(),
        FakeSpeech(),
        data_dir=tmp_path / "data",
        static_dir=static,
        eval_dir=tmp_path / "eval",
    )
    (tmp_path / "eval").mkdir()
    (tmp_path / "eval" / "tickets.jsonl").write_text(
        json.dumps(
            {
                "id": "c01",
                "text": "Min deposit?",
                "language": "en",
                "route": "auto_draft",
                "category": "deposit",
            }
        )
        + "\n"
    )
    (tmp_path / "eval" / "tickets_real.jsonl").write_text(
        json.dumps(
            {
                "id": "r01",
                "text": "Hola",
                "language": "es",
                "route": "human_review",
                "category": "other",
            }
        )
        + "\n"
    )
    yield TestClient(app)


def test_pages_and_static(client: TestClient) -> None:
    assert client.get("/").text == "<h1>console</h1>"
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/business-case").status_code == 404  # file missing: graceful 404


def test_health(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["provider"] == "fake" and body["speech"] == "fake" and body["model"] == "fake"
    assert body["kb_version"] and body["prompt_version"]


def test_samples_core_and_real(client: TestClient) -> None:
    rows = client.get("/api/samples").json()
    assert [(r["id"], r["group"], r["label"]) for r in rows] == [
        ("c01", "core", "auto_draft · deposit"),
        ("r01", "real_themes", "human_review · other"),
    ]


def test_samples_missing_files_skipped(tmp_path: Path) -> None:
    app = create_app(FakeProvider(), FakeSpeech(), data_dir=tmp_path, eval_dir=tmp_path)
    assert TestClient(app).get("/api/samples").json() == []


def test_kb(client: TestClient) -> None:
    body = client.get("/api/kb").json()
    page = next(p for p in body["pages"] if p["slug"] == "how-to-deposit")
    assert page["url"].startswith("https://") and page["title"]
    assert {"id", "heading", "text"} == set(page["chunks"][0])


def test_triage_has_trace_in_order(client: TestClient) -> None:
    r = client.post("/api/triage", json={"text": "What is the minimum deposit amount?", "id": "t1"})
    body = r.json()
    assert r.status_code == 200 and body["ticket_id"] == "t1"
    assert [s["step"] for s in body["trace"]] == STEPS
    assert all(s["ms"] >= 0 and s["detail"] for s in body["trace"])
    assert "sentences" in body["draft"]


@pytest.mark.parametrize("payload", [{"text": ""}, {"text": "   "}, {"text": "x" * 5001}, {}])
def test_triage_validation(client: TestClient, payload: dict[str, str]) -> None:
    assert client.post("/api/triage", json=payload).status_code == 422


def test_trace_for_trading_advice_still_has_all_steps(client: TestClient) -> None:
    body = client.post("/api/triage", json={"text": "Should I buy gold now?"}).json()
    assert [s["step"] for s in body["trace"]] == STEPS
    assert body["decision"]["route"] == "decline_trading_advice"


def test_voice(client: TestClient) -> None:
    files = {"audio": ("q.webm", b"What is the minimum deposit amount?", "audio/webm")}
    r = client.post("/api/voice", files=files, data={"language": "en"})
    body = r.json()
    assert r.status_code == 200
    assert body["transcript"]["text"] == "What is the minimum deposit amount?"
    assert body["result"]["ticket_id"].startswith("voice-")
    assert len(body["result"]["ticket_id"]) == len("voice-") + 8
    assert [s["step"] for s in body["result"]["trace"]] == STEPS


def test_voice_rejections(client: TestClient) -> None:
    assert client.post("/api/voice", files={"audio": ("a.txt", b"x")}).status_code == 422
    assert client.post("/api/voice", files={"audio": ("a.webm", b"")}).status_code == 422
    assert client.post("/api/voice").status_code == 422
    big = b"x" * (10 * 1024 * 1024 + 1)
    assert client.post("/api/voice", files={"audio": ("a.mp3", big)}).status_code == 413


def test_voice_empty_transcript_is_422(tmp_path: Path) -> None:
    class Silent(FakeSpeech):
        def transcribe(
            self, audio: bytes, filename: str, language: str | None = None
        ) -> Transcript:
            return Transcript(text=" ", language="", model="fake", duration_ms=0, cost_usd=0)

    app = create_app(FakeProvider(), Silent(), data_dir=tmp_path)
    assert TestClient(app).post("/api/voice", files={"audio": ("a.wav", b"abc")}).status_code == 422


def test_tts(client: TestClient) -> None:
    r = client.post("/api/tts", json={"text": "hello", "language": "en"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg"
    assert r.content == b"ID3hello"
    assert client.post("/api/tts", json={"text": "", "language": "en"}).status_code == 422
    assert client.post("/api/tts", json={"text": "x" * 2001, "language": "en"}).status_code == 422


def test_tts_speech_error_is_503(tmp_path: Path) -> None:
    class Broken(FakeSpeech):
        def synthesize(self, text: str, language: str) -> bytes:
            raise SpeechError("down sk-secret")

    app = create_app(FakeProvider(), Broken(), data_dir=tmp_path)
    r = TestClient(app).post("/api/tts", json={"text": "hi", "language": "en"})
    assert r.status_code == 503 and r.json() == {"detail": "speech service unavailable"}


def test_feedback_written_and_counted(client: TestClient, tmp_path: Path) -> None:
    assert client.get("/api/feedback/stats").json() == {
        "total": 0,
        "sent_as_is": 0,
        "edited": 0,
        "rejected": 0,
    }
    base = {"ticket_id": "t1", "input_sha256": "a" * 64, "route": "auto_draft"}
    for action in ("sent_as_is", "edited", "edited", "rejected"):
        assert client.post("/api/feedback", json={**base, "action": action}).json() == {"ok": True}
    lines = (tmp_path / "data" / "feedback.jsonl").read_text().splitlines()
    assert len(lines) == 4 and json.loads(lines[0])["ts"].endswith("+00:00")
    assert client.get("/api/feedback/stats").json() == {
        "total": 4,
        "sent_as_is": 1,
        "edited": 2,
        "rejected": 1,
    }
    assert client.post("/api/feedback", json={**base, "action": "nope"}).status_code == 422


def test_speech_error_detail_is_not_leaked(tmp_path: Path) -> None:
    class Broken(FakeSpeech):
        def synthesize(self, text: str, language: str) -> bytes:
            raise SpeechError("down sk-secret")

    r = TestClient(create_app(FakeProvider(), Broken(), data_dir=tmp_path)).post(
        "/api/tts", json={"text": "hi", "language": "en"}
    )
    assert "sk-secret" not in r.text


def test_voice_content_length_checks(client: TestClient) -> None:
    r = client.post("/api/voice", content=b"x", headers={"content-length": str(11 * 1024 * 1024)})
    assert r.status_code == 413
    # chunked upload without a length is refused
    r = client.post(
        "/api/voice", content=iter([b"x"]), headers={"content-type": "multipart/form-data"}
    )
    assert r.status_code == 411


def test_default_speech_follows_fake_provider(tmp_path: Path) -> None:
    app = create_app(FakeProvider(), data_dir=tmp_path)
    assert TestClient(app).get("/api/health").json()["speech"] == "fake"


def test_feedback_limits_and_bad_lines(client: TestClient, tmp_path: Path) -> None:
    base = {"ticket_id": "t1", "input_sha256": "a" * 64, "route": "auto_draft", "action": "edited"}
    assert client.post("/api/feedback", json={**base, "final_text": "x" * 10001}).status_code == 422
    assert client.post("/api/feedback", json={**base, "input_sha256": "z" * 64}).status_code == 422
    assert client.post("/api/feedback", json={**base, "ticket_id": "t" * 101}).status_code == 422
    client.post("/api/feedback", json=base)
    with (tmp_path / "data" / "feedback.jsonl").open("a") as f:
        f.write("{torn\n")
    assert client.get("/api/feedback/stats").json()["total"] == 1


FEEDBACK = {"ticket_id": "t1", "input_sha256": "a" * 64, "route": "auto_draft", "action": "edited"}


def test_demo_token_guards_paid_endpoints(tmp_path: Path) -> None:
    app = create_app(FakeProvider(), FakeSpeech(), data_dir=tmp_path, demo_token="s3cret")
    c = TestClient(app)
    ticket = {"text": "What is the minimum deposit amount?"}
    assert c.post("/api/triage", json=ticket).status_code == 401
    assert c.post("/api/triage", json=ticket, headers={"X-Demo-Token": "nope"}).status_code == 401
    assert c.post("/api/tts", json={"text": "hi"}).status_code == 401
    assert c.post("/api/feedback", json=FEEDBACK).status_code == 401
    assert c.post("/api/voice", files={"audio": ("a.webm", b"hi")}).status_code == 401
    r = c.post("/api/triage", json=ticket, headers={"X-Demo-Token": "s3cret"})
    assert r.status_code == 200 and r.json()["draft"]
    # Read-only endpoints stay open so the page can load.
    assert c.get("/api/health").status_code == 200


def test_no_demo_token_means_open(tmp_path: Path) -> None:
    c = TestClient(create_app(FakeProvider(), FakeSpeech(), data_dir=tmp_path, demo_token=""))
    assert c.post("/api/tts", json={"text": "hi"}).status_code == 200


def test_rate_limit_per_client(tmp_path: Path) -> None:
    app = create_app(FakeProvider(), FakeSpeech(), data_dir=tmp_path, rate_limit_per_min=2)
    c = TestClient(app)
    assert [c.post("/api/tts", json={"text": "hi"}).status_code for _ in range(3)] == [
        200,
        200,
        429,
    ]
    r = c.post("/api/triage", json={"text": "hello"})
    assert r.status_code == 429 and r.json() == {
        "detail": "too many requests, try again in a minute"
    }
    assert c.get("/api/health").status_code == 200  # not limited


def test_rate_limiter_window_slides() -> None:
    from copilot.web.app import RateLimiter

    now = [0.0]
    limiter = RateLimiter(2, clock=lambda: now[0])
    assert limiter.allow("a") and limiter.allow("a") and not limiter.allow("a")
    assert limiter.allow("b")
    now[0] = 60.5
    assert limiter.allow("a")


def test_feedback_log_is_capped(tmp_path: Path) -> None:
    app = create_app(FakeProvider(), FakeSpeech(), data_dir=tmp_path, max_feedback_bytes=300)
    c = TestClient(app)
    codes = [c.post("/api/feedback", json=FEEDBACK).status_code for _ in range(4)]
    assert codes[0] == 200 and codes[-1] == 507
    assert c.post("/api/feedback", json=FEEDBACK).json() == {"detail": "feedback log full"}
    assert (tmp_path / "feedback.jsonl").stat().st_size < 300 + 300


def test_triage_id_is_capped(client: TestClient) -> None:
    assert client.post("/api/triage", json={"text": "hi", "id": "x" * 101}).status_code == 422


def test_provider_error_text_never_reaches_the_browser(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from copilot.llm import OpenAIProvider

    class AuthenticationError(Exception):
        status_code = 401

    class Completions:
        def parse(self, **kwargs: object) -> object:
            raise AuthenticationError("Incorrect API key provided: sk-secret")

    class Client:
        chat = type("Chat", (), {"completions": Completions()})()

    monkeypatch.chdir(tmp_path)  # no .env here
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    provider = OpenAIProvider()
    provider._client = Client()  # type: ignore[assignment]
    app = create_app(provider, FakeSpeech(), data_dir=tmp_path, eval_dir=tmp_path)
    r = TestClient(app).post("/api/triage", json={"text": "What is the minimum deposit amount?"})
    body = r.json()
    assert r.status_code == 200 and "sk-secret" not in r.text
    assert body["errors"] == ["classification failed: AuthenticationError (401)"]
    assert body["decision"]["route"] == "human_review"
