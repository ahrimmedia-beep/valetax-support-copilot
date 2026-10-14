"""Voice check: does speaking a ticket change what the co-pilot does with it?

    uv run python -m eval.voice_eval                  # 8 default tickets, needs OPENAI_API_KEY
    uv run python -m eval.voice_eval --ids c01,c13

Each ticket text is turned into speech (TTS), transcribed back, and triaged twice: from the
original text and from the transcript. The report shows word error rate and whether the
route stayed the same. Audio is cached in eval/audio/. Not run in CI (needs a key).
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
from pathlib import Path
from typing import Any

from copilot.llm import OpenAIProvider
from copilot.models import Ticket
from copilot.pipeline import Copilot
from copilot.voice import OpenAISpeech, SpeechProvider

EVAL_DIR = Path(__file__).resolve().parent


def normalize_words(text: str) -> list[str]:
    return re.sub(r"[^\w\s]", " ", text.lower()).split()


def wer(reference: str, hypothesis: str) -> float:
    """Word error rate: word-level Levenshtein distance divided by reference length."""
    ref, hyp = normalize_words(reference), normalize_words(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1] / len(ref)


def default_ids(rows: list[dict[str, Any]], n: int = 8) -> list[str]:
    """Deterministic pick: first ticket of each non-English language, then English to fill."""
    picked: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if row["language"] != "en" and row["language"] not in seen:
            seen.add(row["language"])
            picked.append(row["id"])
    picked += [r["id"] for r in rows if r["language"] == "en"]
    return picked[:n]


def ensure_audio(speech: SpeechProvider, row: dict[str, Any], audio_dir: Path) -> bytes:
    path = audio_dir / f"{row['id']}.mp3"
    if not path.exists():
        audio_dir.mkdir(parents=True, exist_ok=True)
        path.write_bytes(speech.synthesize(row["text"], row["language"]))
    return path.read_bytes()


def cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def run(ids: list[str] | None, out: Path) -> None:
    rows = [
        json.loads(x)
        for x in (EVAL_DIR / "tickets.jsonl").read_text(encoding="utf-8").splitlines()
        if x.strip()
    ]
    chosen = ids or default_ids(rows)
    by_id = {r["id"]: r for r in rows}
    speech = OpenAISpeech()
    copilot = Copilot(OpenAIProvider())
    lines: list[str] = []
    wers: list[float] = []
    matches = 0
    cost = 0.0
    for tid in chosen:
        row = by_id[tid]
        audio = ensure_audio(speech, row, EVAL_DIR / "audio")
        t = speech.transcribe(audio, f"{tid}.mp3")
        w = wer(row["text"], t.text)
        text_result = copilot.triage(Ticket(id=tid, text=row["text"]))
        voice_result = copilot.triage(Ticket(id=tid, text=t.text))
        same = text_result.decision.route == voice_result.decision.route
        wers.append(w)
        matches += same
        cost += t.cost_usd + text_result.usage.cost_usd + voice_result.usage.cost_usd
        lines.append(
            f"| {tid} | {row['language']} | {cell(row['text'])} | {cell(t.text)} | {w:.2f} "
            f"| {text_result.decision.route} / {voice_result.decision.route} "
            f"| {'yes' if same else 'NO'} |"
        )
        print(f"{tid}: wer={w:.2f} route_match={same}")
    n = len(chosen)
    report = [
        "# Voice eval",
        "",
        f"- Tickets: {n}",
        f"- Route agreement (text vs voice): {100 * matches / n:.0f}% ({matches}/{n})",
        f"- Mean WER: {statistics.mean(wers):.3f}",
        f"- Cost (transcription where reported, plus LLM calls): ${cost:.4f}",
        "",
        "| id | language | original text | transcript | WER | route text / voice | match |",
        "|---|---|---|---|---|---|---|",
        *lines,
        "",
    ]
    out.write_text("\n".join(report), encoding="utf-8")
    print(f"wrote {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0] if __doc__ else "")
    parser.add_argument("--ids", help="comma-separated ticket ids (default: 8 picked by language)")
    parser.add_argument("--out", type=Path, default=EVAL_DIR / "voice_report.md")
    args = parser.parse_args()
    run(args.ids.split(",") if args.ids else None, args.out)


if __name__ == "__main__":
    main()
