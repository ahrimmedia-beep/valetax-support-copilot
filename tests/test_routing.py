from __future__ import annotations

import pytest

from copilot.models import Classification, Draft, GuardrailFlags
from copilot.routing import decide


def cls(**kw: object) -> Classification:
    base: dict[str, object] = dict(
        category="deposit",
        urgency="low",
        language="en",
        sentiment="neutral",
        sensitive_topics=[],
        kb_questions=["q"],
    )
    base.update(kw)
    return Classification.model_validate(base)


GOOD = Draft(reply="ok", coverage="full")


@pytest.mark.parametrize(
    ("flags", "c", "draft", "route", "reason"),
    [
        (GuardrailFlags(), cls(), GOOD, "auto_draft", "grounded_answer_all_checks_passed"),
        (GuardrailFlags(complaint=["scam"]), cls(), GOOD, "human_review", "complaint"),
        (GuardrailFlags(), cls(category="complaint"), GOOD, "human_review", "complaint"),
        (GuardrailFlags(kyc_aml=["x"]), cls(), GOOD, "human_review", "kyc_aml"),
        (GuardrailFlags(), cls(sensitive_topics=["kyc_aml"]), GOOD, "human_review", "kyc_aml"),
        (GuardrailFlags(account_blocked=["x"]), cls(), GOOD, "human_review", "account_blocked"),
        (GuardrailFlags(legal_threat=["x"]), cls(), GOOD, "human_review", "legal_threat"),
        (GuardrailFlags(fraud=["x"]), cls(), GOOD, "human_review", "fraud"),
        (GuardrailFlags(money_issue=["x"]), cls(), GOOD, "human_review", "money_issue"),
        (GuardrailFlags(prompt_injection=["x"]), cls(), GOOD, "human_review", "prompt_injection"),
        (GuardrailFlags(), cls(urgency="high"), GOOD, "human_review", "urgency_high"),
        (GuardrailFlags(), cls(urgency="critical"), GOOD, "human_review", "urgency_critical"),
        (
            GuardrailFlags(),
            cls(sentiment="negative", category="withdrawal"),
            GOOD,
            "human_review",
            "negative_sentiment_money",
        ),
        (
            GuardrailFlags(),
            cls(),
            Draft(reply="h", abstained=True, problems=["kb_not_covered"]),
            "human_review",
            "kb_not_covered",
        ),
        (
            GuardrailFlags(),
            cls(),
            Draft(reply="x", coverage="partial"),
            "human_review",
            "partially_covered",
        ),
        (
            GuardrailFlags(trading_advice=["should i buy"]),
            cls(),
            GOOD,
            "decline_trading_advice",
            "trading_advice",
        ),
        (
            GuardrailFlags(),
            cls(category="trading_advice"),
            GOOD,
            "decline_trading_advice",
            "trading_advice",
        ),
    ],
)
def test_routing_table(flags, c, draft, route, reason) -> None:
    decision = decide(flags, c, draft, errors=[])
    assert decision.route == route and reason in decision.reasons


def test_negative_sentiment_alone_is_not_escalated() -> None:
    assert (
        decide(
            GuardrailFlags(), cls(sentiment="negative", category="account_opening"), GOOD, []
        ).route
        == "auto_draft"
    )


def test_llm_cannot_clear_a_guardrail_flag() -> None:
    """The classifier says everything is fine; the regex flag still wins."""
    calm = cls(category="deposit", urgency="low", sentiment="positive", sensitive_topics=[])
    assert (
        decide(GuardrailFlags(kyc_aml=["source of funds"]), calm, GOOD, []).route == "human_review"
    )


def test_human_review_beats_decline_and_keeps_both_reasons() -> None:
    d = decide(GuardrailFlags(trading_advice=["x"], prompt_injection=["y"]), cls(), GOOD, [])
    assert d.route == "human_review" and d.reasons[:2] == ["trading_advice", "prompt_injection"]


def test_pipeline_error_goes_to_human() -> None:
    assert decide(GuardrailFlags(), cls(), GOOD, ["classification failed"]).route == "human_review"


def test_unanswered_specific_term_goes_to_human() -> None:
    draft = Draft(reply="x", coverage="partial", unanswered_terms=["skrill"])
    assert "specific_term_not_in_kb" in decide(GuardrailFlags(), cls(), draft, []).reasons
