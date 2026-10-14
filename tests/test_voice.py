from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from copilot.voice import (
    FakeSpeech,
    OpenAISpeech,
    SpeechError,
    SpeechProvider,
    transcription_cost,
)
from eval.voice_eval import default_ids, normalize_words, wer


def test_fake_round_trip_text_bytes() -> None:
    speech: SpeechProvider = FakeSpeech()
    t = speech.transcribe(b"How do I withdraw?", "a.webm")
    assert t.text == "How do I withdraw?"
    assert t.model == "fake"
    assert t.cost_usd == 0.0


def test_fake_undecodable_audio_gives_fixed_sentence() -> None:
    t = FakeSpeech().transcribe(b"\xff\xfe\x00\x80", "a.webm")
    assert t.text == "What is the minimum deposit?"


def test_fake_synthesize_stub() -> None:
    assert FakeSpeech().synthesize("hello", "en") == b"ID3hello"
    assert FakeSpeech().name == "fake"


def test_openai_speech_requires_key(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.chdir(tmp_path)  # no .env here, so load_dotenv finds nothing
    with pytest.raises(SpeechError):
        OpenAISpeech()


def test_wer_basics() -> None:
    assert wer("a b c", "a b c") == 0.0
    assert wer("a b c d", "a x c") == pytest.approx(0.5)
    assert wer("", "") == 0.0
    assert wer("", "a") == 1.0


def test_wer_ignores_case_and_punctuation() -> None:
    assert normalize_words("Hello, World! Привет?") == ["hello", "world", "привет"]
    assert wer("What is it?", "what is IT") == 0.0


def test_default_ids_cover_languages() -> None:
    rows = [
        {"id": "e1", "language": "en"},
        {"id": "e2", "language": "en"},
        {"id": "r1", "language": "ru"},
        {"id": "s1", "language": "es"},
    ]
    assert default_ids(rows, 3) == ["r1", "s1", "e1"]


def test_transcription_cost_from_tokens_duration_or_nothing() -> None:
    tokens = SimpleNamespace(type="tokens", input_tokens=1_000_000, output_tokens=200_000)
    assert transcription_cost(tokens) == (0.0, pytest.approx(1.25 + 1.0))
    duration = SimpleNamespace(type="duration", seconds=120.0)
    assert transcription_cost(duration) == (120.0, pytest.approx(0.006))
    assert transcription_cost(None) == (0.0, 0.0)
