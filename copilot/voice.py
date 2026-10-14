"""Speech layer: audio in (transcription) and audio out (text to speech).

Same idea as `llm.py`: the web API only knows `SpeechProvider`. The real vendor is one class,
and an offline fake keeps tests free of keys and network.
"""

from __future__ import annotations

import os
from typing import Protocol

from pydantic import BaseModel

from copilot.llm import load_dotenv, provider_error

# gpt-4o-mini-transcribe, list prices at time of writing; check before use.
# Billed per token when the response reports tokens (USD per 1M input / output tokens),
# per minute of audio when it reports a duration.
TRANSCRIBE_USD_PER_M_TOKENS = (1.25, 5.00)
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


def transcription_cost(usage: object) -> tuple[float, float]:
    """(audio seconds, USD) from the `usage` of a transcription response.

    The SDK reports either tokens (`type="tokens"`, input_tokens / output_tokens) or audio
    duration (`type="duration"`, seconds). When neither is present both stay 0 and the
    console shows the cost as "not reported" rather than a made-up figure.
    """
    if usage is None:
        return 0.0, 0.0
    seconds = float(getattr(usage, "seconds", 0) or 0)
    tokens_in = int(getattr(usage, "input_tokens", 0) or 0)
    tokens_out = int(getattr(usage, "output_tokens", 0) or 0)
    if tokens_in or tokens_out:
        price_in, price_out = TRANSCRIBE_USD_PER_M_TOKENS
        return seconds, (tokens_in * price_in + tokens_out * price_out) / 1_000_000
    return seconds, seconds / 60 * TRANSCRIBE_USD_PER_MIN


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
            raise SpeechError(provider_error(exc, "transcription")) from exc
        seconds, cost = transcription_cost(getattr(response, "usage", None))
        return Transcript(
            text=response.text.strip(),
            language=language or "",
            model=self.transcribe_model,
            duration_ms=seconds * 1000,
            cost_usd=cost,
        )

    def synthesize(self, text: str, language: str) -> bytes:
        try:
            response = self._client.audio.speech.create(
                model=self.tts_model, voice=self.voice, input=text, response_format="mp3"
            )
        except Exception as exc:
            raise SpeechError(provider_error(exc, "speech synthesis")) from exc
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
