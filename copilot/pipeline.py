"""The whole flow for one ticket. Each step is a plain function in its own module:

  guardrails.scan  ->  classify (LLM)  ->  retrieval (BM25)  ->  draft (LLM) + checks  ->  routing

Failure policy: fail closed. If the LLM is down or returns garbage, the ticket still gets a
classification (a safe default), a holding reply and `human_review`.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

from copilot import guardrails, routing
from copilot.draft import abstain, make_draft
from copilot.kb import DEFAULT_KB_DIR, kb_version, load_kb
from copilot.llm import LLMError, LLMProvider
from copilot.models import Classification, Draft, Ticket, TriageResult, Usage
from copilot.prompts import CLASSIFY_SYSTEM, PROMPT_VERSION, classify_user
from copilot.retrieval import BM25Index
from copilot.templates import decline_trading_advice

# Below this BM25 score the best chunk is treated as "nothing relevant found" and no draft is
# attempted. Chosen on the eval set (docs/decisions.md); BM25 scores are corpus-dependent,
# so this must be re-checked whenever the KB changes.
MIN_TOP_SCORE = 1.0

SAFE_DEFAULT = Classification(
    category="other",
    urgency="normal",
    language="en",
    sentiment="neutral",
    sensitive_topics=[],
    kb_questions=[],
)


class Copilot:
    def __init__(self, provider: LLMProvider, kb_dir: Path = DEFAULT_KB_DIR) -> None:
        self.provider = provider
        self.index = BM25Index(load_kb(kb_dir))
        self.kb_version = kb_version(kb_dir)

    def classify(self, text: str, usage: Usage, errors: list[str]) -> Classification:
        try:
            result = self.provider.complete_json(
                system=CLASSIFY_SYSTEM, user=classify_user(text), schema=Classification
            )
        except LLMError as exc:
            errors.append(f"classification failed: {exc}")
            return SAFE_DEFAULT.model_copy()
        usage.add(result.usage)
        cls = result.parsed
        cls.language = cls.language.strip().lower()[:2] or "en"
        return cls

    def triage(self, ticket: Ticket) -> TriageResult:
        started = time.perf_counter()
        usage = Usage()
        errors: list[str] = []

        # 1. Deterministic guardrails on the original text; PII removed before any LLM call.
        flags = guardrails.scan(ticket.text)
        llm_text, _ = guardrails.redact_pii(ticket.text)

        # 2. Classification.
        cls = self.classify(llm_text, usage, errors)
        # The rewritten questions pass the same trading-advice filter as the ticket.
        cls.kb_questions = [q for q in cls.kb_questions if not guardrails.scan(q).trading_advice]
        trading = routing.is_trading_advice(flags, cls)

        # 3-4. Retrieval and grounded draft, only for real support questions.
        retrieved = self.index.search(cls.kb_questions) if cls.kb_questions else []
        if cls.kb_questions:
            draft, draft_usage = make_draft(
                self.provider, llm_text, cls.kb_questions, cls.language, retrieved, MIN_TOP_SCORE
            )
            usage.add(draft_usage)
            errors += [p for p in draft.problems if p.startswith("llm_error")]
        elif trading:
            draft = Draft(reply="", coverage="not_applicable")
        else:
            draft = abstain(cls.language, ["no_support_question"])

        if trading:
            decline = decline_trading_advice(cls.language)
            # Keep the answer (or holding reply) for the non-advice part of the ticket.
            extra = "\n\n" + draft.reply if draft.reply else ""
            draft = draft.model_copy(update={"reply": decline + extra})

        # 5. Routing.
        decision = routing.decide(flags, cls, draft, errors)

        return TriageResult(
            ticket_id=ticket.id,
            input_sha256=hashlib.sha256(ticket.text.encode()).hexdigest(),
            guardrails=flags,
            classification=cls,
            retrieved=retrieved,
            draft=draft,
            decision=decision,
            usage=usage,
            total_latency_ms=round((time.perf_counter() - started) * 1000, 1),
            model=self.provider.model,
            prompt_version=PROMPT_VERSION,
            kb_version=self.kb_version,
            errors=errors,
        )
