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
from copilot.models import (
    Classification,
    Draft,
    ScoredChunk,
    Ticket,
    TraceStep,
    TriageResult,
    Usage,
)
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


def _ms(since: float) -> float:
    return round((time.perf_counter() - since) * 1000, 2)


def _draft_detail(draft: Draft, ran: bool) -> str:
    if not ran:
        return "skipped: no support question to answer"
    if draft.abstained:
        return f"abstained: {draft.problems[0].split(':', 1)[0] if draft.problems else 'unknown'}"
    return (
        f"covered={draft.coverage}, {len(draft.sentences)} sentences, "
        f"{len(draft.citations)} citations"
    )


def _verify_detail(draft: Draft, ran: bool) -> str:
    if not ran:
        return "skipped: nothing to verify"
    if draft.problems:
        first = draft.problems[0]
        # These stop the draft before any check runs.
        if first.split(":", 1)[0] in {"kb_not_covered", "low_retrieval_score", "llm_error"}:
            return f"skipped: abstained ({first})"
        return f"failed: {first}"
    return "all checks passed"


def _retrieve_detail(retrieved: list[ScoredChunk], total: int, searched: bool) -> str:
    if not searched:
        return "skipped: no support question"
    if not retrieved:
        return f"no matches in {total} chunks"
    best = retrieved[0]
    return f"top {len(retrieved)} of {total} chunks, best {best.chunk.id} (score {best.score:.1f})"


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
        trace: list[TraceStep] = []
        t = time.perf_counter()
        flags = guardrails.scan(ticket.text)
        raised = [name for name, hits in flags.model_dump().items() if hits and name != "pii_types"]
        trace.append(
            TraceStep(
                step="guardrails",
                ms=_ms(t),
                detail=f"{len(raised)} flags: {', '.join(raised)}" if raised else "no flags",
            )
        )
        t = time.perf_counter()
        llm_text, pii = guardrails.redact_pii(ticket.text)
        trace.append(
            TraceStep(
                step="redaction",
                ms=_ms(t),
                detail=f"redacted: {', '.join(pii)}" if pii else "nothing to redact",
            )
        )

        # 2. Classification.
        t = time.perf_counter()
        cls = self.classify(llm_text, usage, errors)
        trace.append(
            TraceStep(
                step="classify",
                ms=_ms(t),
                detail=f"category={cls.category} urgency={cls.urgency} lang={cls.language}",
            )
        )
        # The rewritten questions pass the same trading-advice filter as the ticket.
        cls.kb_questions = [q for q in cls.kb_questions if not guardrails.scan(q).trading_advice]
        trading = routing.is_trading_advice(flags, cls)

        # 3-4. Retrieval and grounded draft, only for real support questions.
        t = time.perf_counter()
        retrieved = self.index.search(cls.kb_questions) if cls.kb_questions else []
        trace.append(
            TraceStep(
                step="retrieve",
                ms=_ms(t),
                detail=_retrieve_detail(retrieved, len(self.index.chunks), bool(cls.kb_questions)),
            )
        )
        drafted = bool(cls.kb_questions)
        llm_ms = 0.0
        t = time.perf_counter()
        if drafted:
            draft, draft_usage = make_draft(
                self.provider, llm_text, cls.kb_questions, cls.language, retrieved, MIN_TOP_SCORE
            )
            usage.add(draft_usage)
            llm_ms = draft_usage.llm_latency_ms
            errors += [p for p in draft.problems if p.startswith("llm_error")]
        elif trading:
            draft = Draft(reply="", coverage="not_applicable")
        else:
            draft = abstain(cls.language, ["no_support_question"])
        # make_draft runs the LLM call and the checks; split its time by the LLM latency.
        total_ms = _ms(t)
        draft_ms = min(round(llm_ms, 2), total_ms)
        trace.append(TraceStep(step="draft", ms=draft_ms, detail=_draft_detail(draft, drafted)))
        trace.append(
            TraceStep(
                step="verify",
                ms=max(round(total_ms - draft_ms, 2), 0.0),
                detail=_verify_detail(draft, drafted),
            )
        )

        if trading:
            decline = decline_trading_advice(cls.language)
            # Keep the answer (or holding reply) for the non-advice part of the ticket.
            extra = "\n\n" + draft.reply if draft.reply else ""
            draft = draft.model_copy(update={"reply": decline + extra})

        # 5. Routing.
        t = time.perf_counter()
        decision = routing.decide(flags, cls, draft, errors)
        trace.append(
            TraceStep(
                step="route",
                ms=_ms(t),
                detail=(
                    f"{decision.route}: {', '.join(decision.reasons)}"
                    if decision.reasons
                    else decision.route
                ),
            )
        )

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
            trace=trace,
        )
