"""Step 5: routing. Plain code, no LLM. Each rule is one line in the table below.

Phase 1 sends nothing automatically. `auto_draft` means "the agent may send after a glance";
`human_review` means "an agent must read, decide and edit"; `decline_trading_advice` means
"a fixed, compliance-approved decline is ready to send".

Signals are combined with OR: a flag raised by the deterministic guardrails cannot be
cleared by the LLM, and the LLM can add flags the regexes missed. So the LLM can only make
routing stricter, never looser.
"""

from __future__ import annotations

from copilot.models import Classification, Decision, Draft, GuardrailFlags

MONEY_CATEGORIES = {"deposit", "withdrawal"}


def human_review_reasons(
    flags: GuardrailFlags, cls: Classification, draft: Draft, errors: list[str]
) -> list[str]:
    llm_topics = set(cls.sensitive_topics)
    rules: list[tuple[str, bool]] = [
        (
            "complaint",
            bool(flags.complaint) or "complaint" in llm_topics or cls.category == "complaint",
        ),
        ("kyc_aml", bool(flags.kyc_aml) or "kyc_aml" in llm_topics),
        ("account_blocked", bool(flags.account_blocked) or "account_blocked" in llm_topics),
        ("legal_threat", bool(flags.legal_threat) or "legal_threat" in llm_topics),
        ("fraud", bool(flags.fraud) or "fraud" in llm_topics),
        ("money_issue", bool(flags.money_issue)),
        ("prompt_injection", bool(flags.prompt_injection)),
        (f"urgency_{cls.urgency}", cls.urgency in {"high", "critical"}),
        (
            "negative_sentiment_money",
            cls.sentiment == "negative" and cls.category in MONEY_CATEGORIES,
        ),
        ("abstained", draft.abstained),
        ("partially_covered", draft.coverage == "partial"),
        ("specific_term_not_in_kb", bool(draft.unanswered_terms)),
        ("pipeline_error", bool(errors)),
    ]
    reasons = [name for name, hit in rules if hit]
    # Why the draft was rejected, e.g. "kb_not_covered", "citation_check_failed".
    for p in draft.problems:
        code = p.split(":", 1)[0]
        if code not in reasons:
            reasons.append(code)
    return reasons


def is_trading_advice(flags: GuardrailFlags, cls: Classification) -> bool:
    return bool(flags.trading_advice) or cls.category == "trading_advice"


def decide(flags: GuardrailFlags, cls: Classification, draft: Draft, errors: list[str]) -> Decision:
    reasons = human_review_reasons(flags, cls, draft, errors)
    trading = is_trading_advice(flags, cls)
    if reasons:
        return Decision(
            route="human_review", reasons=(["trading_advice"] if trading else []) + reasons
        )
    if trading:
        return Decision(route="decline_trading_advice", reasons=["trading_advice"])
    return Decision(route="auto_draft", reasons=["grounded_answer_all_checks_passed"])
