"""Sentence-level grounding: every sentence of a draft is tied to the citations behind it,
and code checks each sentence against its own sources, not against the whole reply."""

from __future__ import annotations

import re

import pytest

from copilot import guardrails
from copilot.draft import make_draft
from copilot.llm import FakeProvider
from copilot.models import (
    Chunk,
    Draft,
    LLMCitation,
    LLMDraft,
    LLMSentence,
    ScoredChunk,
    SentenceKind,
)
from copilot.templates import HOLDING_REPLY, holding_reply

SKRILL = "Withdrawals to Skrill are processed within 24 hours of the request."
CARD = "Bank card withdrawals are free of any fee charged by us."
GREETING = "Thank you for contacting us."


def _chunk(cid: str, text: str) -> ScoredChunk:
    page = cid.split("#")[0]
    chunk = Chunk(id=cid, page=page, url=f"https://example.test/{page}/", heading="Q", text=text)
    return ScoredChunk(chunk=chunk, score=5.0)


RETRIEVED = [_chunk("withdraw#skrill", SKRILL), _chunk("withdraw#card", CARD)]
CITES = [
    LLMCitation(chunk_id="withdraw#skrill", quote=SKRILL),
    LLMCitation(chunk_id="withdraw#card", quote=CARD),
]


def _run(
    sentences: list[LLMSentence],
    citations: list[LLMCitation] = CITES,
    ticket: str = "How do withdrawals work?",
) -> Draft:
    def responder(system: str, user: str) -> LLMDraft:
        return LLMDraft(covered="full", citations=citations, sentences=sentences)

    provider = FakeProvider({LLMDraft: responder})
    return make_draft(provider, ticket, ["withdrawals"], "en", RETRIEVED, 1.0)[0]


def fact(text: str, *cites: int) -> LLMSentence:
    return LLMSentence(text=text, kind="fact", cites=list(cites))


def test_grounded_sentences_are_returned_with_their_chunk_ids() -> None:
    draft = _run(
        [
            LLMSentence(text=GREETING, kind="greeting", cites=[]),
            fact("Withdrawals to Skrill are processed within 24 hours.", 0),
            fact("Card withdrawals carry no fee, and Skrill takes up to 24 hours.", 1, 0, 1),
        ]
    )
    assert not draft.abstained and draft.problems == []
    assert draft.reply == (
        "Thank you for contacting us. Withdrawals to Skrill are processed within 24 hours. "
        "Card withdrawals carry no fee, and Skrill takes up to 24 hours."
    )
    assert [(s.kind, s.chunk_ids) for s in draft.sentences] == [
        ("greeting", []),
        ("fact", ["withdraw#skrill"]),
        ("fact", ["withdraw#card", "withdraw#skrill"]),
    ]
    assert draft.sentences[1].text == "Withdrawals to Skrill are processed within 24 hours."


def test_fact_without_a_cite_abstains() -> None:
    text = "Withdrawals to Skrill are processed within 24 hours."
    draft = _run([fact(text)])
    assert draft.abstained and draft.problems == [f"uncited_fact: {text}"]
    assert draft.reply == holding_reply("en") and draft.sentences == []


def test_cite_out_of_range_is_a_bad_cite() -> None:
    draft = _run([fact("Withdrawals to Skrill are processed within 24 hours.", 0, 2, -1)])
    assert draft.abstained and draft.problems == ["bad_cite: 2", "bad_cite: -1"]


def test_cite_to_a_failed_citation_is_a_bad_cite() -> None:
    text = "Card withdrawals are free."
    citations = [CITES[0], LLMCitation(chunk_id="withdraw#card", quote="All withdrawals are free.")]
    draft = _run([fact(text, 1)], citations=citations)
    assert draft.abstained
    assert draft.problems[0].startswith("citation_check_failed: quote not in withdraw#card")
    assert draft.problems[1:] == ["bad_cite: 1", f"uncited_fact: {text}"]


def test_number_from_another_sentences_source_abstains() -> None:
    """24 is in a cited chunk, so the whole-reply check passes; but not in this sentence's."""
    draft = _run(
        [
            fact("Withdrawals to Skrill are processed quickly.", 0),
            fact("Card withdrawals are free and take 24 hours.", 1),
        ]
    )
    assert draft.abstained and draft.problems == ["sentence_number_not_in_its_source: 24"]


def test_number_from_the_ticket_is_allowed_in_a_fact() -> None:
    draft = _run(
        [fact("Your withdrawal of 150 USD to Skrill is processed within 24 hours.", 0)],
        ticket="I asked to withdraw 150 USD to Skrill, when will it arrive?",
    )
    assert not draft.abstained and draft.problems == []


def test_term_from_another_sentences_source_abstains() -> None:
    draft = _run(
        [
            fact("Withdrawals are processed within 24 hours.", 0),
            fact("There is no fee for Skrill.", 1),
        ]
    )
    assert draft.abstained and draft.problems == ["sentence_term_not_in_its_source: skrill"]


def test_term_from_the_ticket_is_allowed_in_a_fact() -> None:
    draft = _run(
        [fact("PayPal is not listed, but bank card withdrawals have no fee.", 1)],
        ticket="Can I withdraw to PayPal or a bank card?",
    )
    assert not draft.abstained


def test_number_in_a_greeting_is_a_disguised_fact() -> None:
    text = "Thanks for asking, Skrill takes 24 hours."
    draft = _run([LLMSentence(text=text, kind="greeting", cites=[]), fact(SKRILL, 0)])
    assert draft.abstained and draft.problems == [f"fact_disguised_as_greeting: {text}"]


def test_term_in_a_closing_is_a_disguised_fact() -> None:
    text = "You can always withdraw to Skrill."
    draft = _run([fact(SKRILL, 0), LLMSentence(text=text, kind="closing", cites=[])])
    assert draft.abstained and draft.problems == [f"fact_disguised_as_closing: {text}"]


def test_long_handoff_is_a_disguised_fact() -> None:
    text = " ".join(["word"] * 31) + "."
    draft = _run([fact(SKRILL, 0), LLMSentence(text=text, kind="handoff", cites=[])])
    assert draft.abstained and draft.problems == [f"fact_disguised_as_handoff: {text}"]


def test_short_handoff_is_fine() -> None:
    text = " ".join(["word"] * 30) + "."
    draft = _run([fact(SKRILL, 0), LLMSentence(text=text, kind="handoff", cites=[])])
    assert not draft.abstained
    assert [s.kind for s in draft.sentences] == ["fact", "handoff"]


@pytest.mark.parametrize(
    ("kind", "text"),
    [
        ("handoff", "A colleague will get back to you within two business days."),
        ("greeting", "Good news, deposits are credited instantly and free of charge."),
        ("closing", "Withdrawals by card are free of charge and arrive the same day."),
    ],
)
def test_timeline_or_price_in_a_courtesy_sentence_is_a_disguised_fact(
    kind: SentenceKind, text: str
) -> None:
    """No digits, no specific terms, short: only the courtesy word list catches these."""
    draft = _run([fact(SKRILL, 0), LLMSentence(text=text, kind=kind, cites=[])])
    assert draft.abstained and draft.problems == [f"fact_disguised_as_{kind}: {text}"]


@pytest.mark.parametrize(
    "text",
    [
        "Коллега ответит вам в течение двух рабочих дней.",
        "Пополнение бесплатно и мгновенно.",
        "Buenas noticias: los depósitos son gratis.",
        "Su retiro llegará mañana.",
        "Penarikan Anda diproses hari ini.",
        "Penarikan Anda akan diproses segera.",
        "سيتم الرد عليك خلال يومين.",
        "الإيداع مجاني.",
        "अच्छी खबर, जमा तुरंत होता है।",
        "पैसा कल आएगा।",
    ],
)
def test_courtesy_word_list_is_multilingual(text: str) -> None:
    draft = _run([fact(SKRILL, 0), LLMSentence(text=text, kind="handoff", cites=[])])
    assert draft.abstained and draft.problems == [f"fact_disguised_as_handoff: {text}"]


def _sentences(text: str) -> list[str]:
    return [x for x in re.split(r"(?<=[.。।])\s+", text.strip()) if x]


HANDOFFS = [
    *(x for reply in HOLDING_REPLY.values() for x in _sentences(reply)),
    "A colleague will follow up on your other question.",
    "One of our colleagues will follow up on the rest of your message.",
    "Feel free to contact us if you have any other questions.",
    # Fixed courtesy phrases that contain a time word but state no fact.
    "Have a nice day.",
    "Have a great day!",
    "How can I help you today?",
    "Thank you for contacting us today.",
    "Хорошего дня!",
    "¡Que tenga un buen día!",
    "Semoga hari Anda menyenangkan.",
    "طاب يومك.",
    "आपका दिन शुभ हो।",
]


@pytest.mark.parametrize(
    "text",
    [
        "Thank you for contacting us today, your deposit will be credited today.",
        "Have a nice day, your withdrawal is processed today.",
        "Your request will be processed today.",
        "Have a great day, a colleague will reply within two days.",
        "Хорошего дня, деньги придут завтра.",
    ],
)
def test_courtesy_phrase_does_not_hide_a_promise(text: str) -> None:
    """Allowed phrases are removed before matching; time words outside them still count."""
    draft = _run([fact(SKRILL, 0), LLMSentence(text=text, kind="closing", cites=[])])
    assert draft.abstained and draft.problems == [f"fact_disguised_as_closing: {text}"]


@pytest.mark.parametrize("text", HANDOFFS)
def test_template_and_plain_handoffs_still_pass(text: str) -> None:
    assert guardrails.courtesy_violations(text) == []
    draft = _run([fact(SKRILL, 0), LLMSentence(text=text, kind="handoff", cites=[])])
    assert not draft.abstained, draft.problems


def test_courtesy_without_spaces_is_capped_by_characters() -> None:
    """The word cap is a no-op for scripts without spaces (Thai, Chinese)."""
    long_text = "ขอบคุณ" * 34  # 204 characters, one "word"
    draft = _run([fact(SKRILL, 0), LLMSentence(text=long_text, kind="closing", cites=[])])
    assert draft.abstained and draft.problems == [f"fact_disguised_as_closing: {long_text}"]
    ok_text = "ขอบคุณ" * 33  # 198 characters
    assert not _run(
        [fact(SKRILL, 0), LLMSentence(text=ok_text, kind="closing", cites=[])]
    ).abstained


def test_covered_without_sentences_is_not_covered() -> None:
    draft = _run([])
    assert draft.abstained and draft.problems == ["kb_not_covered"]


def test_fake_provider_drafts_a_greeting_and_a_cited_fact() -> None:
    draft = make_draft(FakeProvider(), "How do withdrawals work?", ["w"], "en", RETRIEVED, 1.0)[0]
    assert not draft.abstained
    assert [(s.kind, s.chunk_ids) for s in draft.sentences] == [
        ("greeting", []),
        ("fact", ["withdraw#skrill"]),
    ]
    assert draft.sentences[1].text == SKRILL
