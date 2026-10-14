"""Speech layer: audio in (transcription) and audio out (text to speech).

Same idea as `llm.py`: the web API only knows `SpeechProvider`. The real vendor is one class,
and an offline fake keeps tests free of keys and network.
"""

from __future__ import annotations

import os
from typing import Protocol

from pydantic import BaseModel

from copilot.llm import load_dotenv

# USD per minute of audio for gpt-4o-mini-transcribe. List price at the time of writing.
TRANSCRIBE_USD_PER_MIN = 0.003
FAKE_SENTENCE = "What is the minimum deposit?"


class SpeechError(RuntimeError):
    """Transcription or synthesis failed (or the provider is not configured)."""


class Transcript(BaseModel):
    text: str
    language: str  # "" when unknown
    model: str
    duration_ms: float
    cost_usd: float


class SpeechProvider(Protocol):
    name: str

    def transcribe(
        self, audio: bytes, filename: str, language: str | None = None
    ) -> Transcript: ...

    def synthesize(self, text: str, language: str) -> bytes: ...


class OpenAISpeech:
    name = "openai"

    def __init__(
        self,
        transcribe_model: str = "gpt-4o-mini-transcribe",
        tts_model: str = "gpt-4o-mini-tts",
        voice: str = "alloy",
        timeout_s: float = 60.0,
    ) -> None:
        from openai import OpenAI  # lazy: tests never need the SDK configured

        load_dotenv()
        if not os.environ.get("OPENAI_API_KEY"):
            raise SpeechError("OPENAI_API_KEY is not set (put it in .env or the environment)")
        self.transcribe_model = transcribe_model
        self.tts_model = tts_model
        self.voice = voice
        self._client = OpenAI(timeout=timeout_s)

    def transcribe(self, audio: bytes, filename: str, language: str | None = None) -> Transcript:
        try:
            if language:
                response = self._client.audio.transcriptions.create(
                    model=self.transcribe_model,
                    file=(filename, audio),
                    response_format="json",
                    language=language,
                )
            else:
                response = self._client.audio.transcriptions.create(
                    model=self.transcribe_model,
                    file=(filename, audio),
                    response_format="json",
                )
        except Exception as exc:  # network, bad audio, rate limit
            raise SpeechError(f"{type(exc).__name__}: {exc}") from exc
        # The json response of this model carries only text; the duration is usually missing,
        # so duration_ms and cost stay 0 unless the SDK reports seconds.
        usage = getattr(response, "usage", None)
        seconds = float(getattr(usage, "seconds", 0) or 0)
        return Transcript(
            text=response.text.strip(),
            language=language or "",
            model=self.transcribe_model,
            duration_ms=seconds * 1000,
            cost_usd=seconds / 60 * TRANSCRIBE_USD_PER_MIN,
        )

    def synthesize(self, text: str, language: str) -> bytes:
        try:
            response = self._client.audio.speech.create(
                model=self.tts_model, voice=self.voice, input=text, response_format="mp3"
            )
        except Exception as exc:
            raise SpeechError(f"{type(exc).__name__}: {exc}") from exc
        return response.content


class FakeSpeech:
    """Offline stand-in: tests send text bytes as "audio" and get the same text back."""

    name = "fake"

    def transcribe(self, audio: bytes, filename: str, language: str | None = None) -> Transcript:
        try:
            text = audio.decode("utf-8").strip()
        except UnicodeDecodeError:
            text = FAKE_SENTENCE
        return Transcript(
            text=text, language=language or "", model="fake", duration_ms=0.0, cost_usd=0.0
        )

    def synthesize(self, text: str, language: str) -> bytes:
        return b"ID3" + text.encode("utf-8")
