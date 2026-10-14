"""LLM layer: one small interface, a real OpenAI implementation and an offline fake.

The pipeline only knows `LLMProvider.complete_json(system, user, schema)`. Swapping the
vendor, adding a fallback model or routing some tickets to a larger model is a change in
this file, not in the pipeline.
"""

from __future__ import annotations

import logging
import os
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from copilot.models import Category, Classification, LLMCitation, LLMDraft, LLMSentence, Usage

# USD per 1M tokens (input, output). List prices at the time of writing; check before use.
PRICES: dict[str, tuple[float, float]] = {
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4o-mini": (0.15, 0.60),
    "fake": (0.0, 0.0),
}
DEFAULT_MODEL = "gpt-4.1"
log = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """The model could not produce a valid structured answer. The pipeline fails closed."""


def provider_error(exc: Exception, what: str) -> str:
    """A short, safe description of a vendor exception: class name and HTTP status only.

    The vendor's own message can echo request details (a masked key, account ids), so it is
    logged on the server and never put in a result that reaches the browser.
    """
    log.error("%s failed: %s: %s", what, type(exc).__name__, exc)
    status = getattr(exc, "status_code", None)
    return f"{type(exc).__name__} ({status})" if isinstance(status, int) else type(exc).__name__


@dataclass
class LLMResult[T: BaseModel]:
    parsed: T
    usage: Usage


class LLMProvider(Protocol):
    model: str

    def complete_json[T: BaseModel](
        self, *, system: str, user: str, schema: type[T]
    ) -> LLMResult[T]: ...


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = PRICES.get(model, PRICES[DEFAULT_MODEL])
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000


def load_dotenv(path: Path = Path(".env")) -> None:
    """Minimal .env loader (KEY=VALUE lines). Existing environment variables win."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


class OpenAIProvider:
    """Structured outputs (JSON schema generated from the Pydantic model), temperature 0,
    bounded retries with backoff (handled by the SDK) and a hard timeout per call."""

    def __init__(self, model: str = DEFAULT_MODEL, timeout_s: float = 30.0, retries: int = 3):
        from openai import OpenAI  # imported lazily so tests never need the SDK configured

        load_dotenv()
        if not os.environ.get("OPENAI_API_KEY"):
            raise LLMError("OPENAI_API_KEY is not set (put it in .env or the environment)")
        self.model = model
        self._client = OpenAI(timeout=timeout_s, max_retries=retries)

    def complete_json[T: BaseModel](
        self, *, system: str, user: str, schema: type[T]
    ) -> LLMResult[T]:
        started = time.perf_counter()
        try:
            response = self._client.chat.completions.parse(
                model=self.model,
                temperature=0,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format=schema,
            )
        except Exception as exc:  # network, rate limit after retries, schema rejection
            raise LLMError(provider_error(exc, "LLM call")) from exc
        message = response.choices[0].message
        if message.parsed is None:
            log.error("LLM returned no parsed output (refusal=%r)", message.refusal)
            raise LLMError("no parsed output")
        tokens_in = response.usage.prompt_tokens if response.usage else 0
        tokens_out = response.usage.completion_tokens if response.usage else 0
        usage = Usage(
            calls=1,
            input_tokens=tokens_in,
            output_tokens=tokens_out,
            cost_usd=cost_usd(self.model, tokens_in, tokens_out),
            llm_latency_ms=(time.perf_counter() - started) * 1000,
        )
        return LLMResult(parsed=message.parsed, usage=usage)


# --- Offline fake -------------------------------------------------------------------------

Responder = Callable[[str, str], BaseModel]


def _fake_classify(system: str, user: str) -> Classification:
    """Keyword heuristics. Good enough to drive the pipeline end to end in tests."""
    text = user.lower()
    category: Category = "other"
    keywords: list[tuple[Category, tuple[str, ...]]] = [
        ("withdrawal", ("withdraw",)),
        ("deposit", ("deposit",)),
        ("verification", ("verif", "kyc", "document")),
        ("account_opening", ("open an account", "open account", "sign up", "islamic")),
    ]
    for cat, words in keywords:
        if any(w in text for w in words):
            category = cat
            break
    questions = []
    m = re.search(r"<ticket>(.*?)</ticket>", user, re.S)
    if m and category != "other":
        questions = [m.group(1).strip()[:200]]
    return Classification(
        category=category,
        urgency="normal",
        language="en",
        sentiment="neutral",
        sensitive_topics=[],
        kb_questions=questions,
    )


def _fake_draft(system: str, user: str) -> LLMDraft:
    """A greeting, then the first sentence of the first source as a fact citing it verbatim."""
    m = re.search(r'<source id="([^"]+)"[^>]*>\n(.*?)\n</source>', user, re.S)
    if not m:
        return LLMDraft(covered="none", citations=[], sentences=[])
    chunk_id, body = m.group(1), m.group(2)
    answer = body.split("\n", 1)[-1]
    sentence = re.split(r"(?<=[.!?])\s", answer.strip())[0]
    return LLMDraft(
        covered="full",
        citations=[LLMCitation(chunk_id=chunk_id, quote=sentence)],
        sentences=[
            LLMSentence(text="Thank you for reaching out.", kind="greeting", cites=[]),
            LLMSentence(text=sentence, kind="fact", cites=[0]),
        ],
    )


class FakeProvider:
    """Deterministic, offline, free. Used by unit tests and `--provider fake`.

    Tests can override behaviour per schema: FakeProvider({LLMDraft: my_function}).
    """

    model = "fake"

    def __init__(self, responders: dict[type[BaseModel], Responder] | None = None) -> None:
        self.responders: dict[type[BaseModel], Responder] = {
            Classification: _fake_classify,
            LLMDraft: _fake_draft,
        }
        self.responders.update(responders or {})
        self.calls: list[type[BaseModel]] = []

    def complete_json[T: BaseModel](
        self, *, system: str, user: str, schema: type[T]
    ) -> LLMResult[T]:
        self.calls.append(schema)
        result = self.responders[schema](system, user)
        if not isinstance(result, schema):
            raise LLMError(f"fake responder returned {type(result).__name__}, not {schema}")
        return LLMResult(parsed=result, usage=Usage(calls=1))
