from __future__ import annotations

from copilot.draft import make_draft, normalize, numbers_in, ungrounded_numbers, verify_citations
from copilot.llm import FakeProvider, LLMError
from copilot.models import LLMCitation, LLMDraft, ScoredChunk
from copilot.retrieval import BM25Index
from copilot.templates import holding_reply

MIN_DEPOSIT = "The minimum deposit starts from 8 USD, depending on the account type."


def _retrieved(index: BM25Index) -> list[ScoredChunk]:
    return index.search(["minimum deposit amount"])


def _draft_with(reply: str, quote: str = MIN_DEPOSIT, chunk_id: str = "how-to-deposit#faq-1"):
    def responder(system: str, user: str) -> LLMDraft:
        return LLMDraft(
            covered="full", reply=reply, citations=[LLMCitation(chunk_id=chunk_id, quote=quote)]
        )

    return FakeProvider({LLMDraft: responder})


def _run(provider: FakeProvider, index: BM25Index, ticket: str = "What is the minimum deposit?"):
    return make_draft(provider, ticket, ["minimum deposit"], "en", _retrieved(index), 1.0)[0]


def test_normalize_ignores_formatting_not_words() -> None:
    assert normalize("  That day’s   RATES. ") == normalize("that day's rates")
    assert normalize("click on \x1fCreate Account\x1f") == normalize("click on ‘Create Account‘")
    assert normalize("eight USD") != normalize("8 USD")


def test_verify_citations(index: BM25Index) -> None:
    retrieved = _retrieved(index)
    ok, problems = verify_citations(
        [
            LLMCitation(chunk_id="how-to-deposit#faq-1", quote=MIN_DEPOSIT),
            LLMCitation(chunk_id="how-to-deposit#faq-1", quote="The minimum deposit is 5 USD."),
            LLMCitation(chunk_id="how-to-verify-account#steps", quote=MIN_DEPOSIT),
            LLMCitation(chunk_id="how-to-deposit#faq-1", quote="8 USD"),
        ],
        retrieved,
    )
    assert len(ok) == 1 and ok[0].page == "https://valetax.com/how-to-deposit/"
    assert [p.split(":")[1].strip().split(" ")[0] for p in problems] == [
        "quote",
        "unknown",
        "quote",
    ]


def test_numbers_unicode_and_list_markers() -> None:
    assert numbers_in("خلال ٦٠ دقيقة") == {"60"}
    assert numbers_in("1. Log in\n2. Select") == set()
    assert numbers_in("up to 1:2000 and $1,200") == {"1:2000", "1200"}
    assert ungrounded_numbers("Fee is 2% after 3 days", [MIN_DEPOSIT]) == ["2", "3"]


def test_grounded_draft_is_used(index: BM25Index) -> None:
    draft = _run(_draft_with("The minimum deposit starts from 8 USD."), index)
    assert not draft.abstained and draft.citations[0].quote == MIN_DEPOSIT
    assert draft.citations_valid == draft.citations_proposed == 1


def test_invented_number_forces_abstain(index: BM25Index) -> None:
    draft = _run(_draft_with("The minimum deposit is 8 USD and it is credited in 2 hours."), index)
    assert draft.abstained and draft.problems == ["ungrounded_number: 2"]
    assert draft.reply == holding_reply("en")


def test_fabricated_quote_forces_abstain(index: BM25Index) -> None:
    draft = _run(_draft_with("Deposits are free.", quote="All deposits are free of charge."), index)
    assert draft.abstained and draft.problems[0].startswith("citation_check_failed")


def test_advice_in_reply_forces_abstain(index: BM25Index) -> None:
    draft = _run(_draft_with("Deposit 8 USD. I recommend you buy gold."), index)
    assert draft.abstained and draft.problems[0].startswith("unsafe_reply")


def test_not_covered_abstains(index: BM25Index) -> None:
    provider = FakeProvider(
        {LLMDraft: lambda s, u: LLMDraft(covered="none", reply="", citations=[])}
    )
    assert _run(provider, index).problems == ["kb_not_covered"]


def test_llm_failure_abstains(index: BM25Index) -> None:
    def boom(system: str, user: str) -> LLMDraft:
        raise LLMError("timeout")

    draft = _run(FakeProvider({LLMDraft: boom}), index)
    assert draft.abstained and draft.problems[0].startswith("llm_error")


def test_low_retrieval_score_skips_the_llm(index: BM25Index) -> None:
    provider = FakeProvider()
    draft, usage = make_draft(provider, "?", ["x"], "ru", [], 1.0)
    assert draft.abstained and provider.calls == [] and usage.calls == 0
    assert draft.reply == holding_reply("ru")


DOCS = (
    "For live accounts, we will require a Proof of identification and Proof of address via a "
    "bank statement or a utility bill that are not older than 6 months."
)


def _docs_run(index: BM25Index, reply: str, ticket: str):
    def responder(system: str, user: str) -> LLMDraft:
        return LLMDraft(
            covered="full",
            reply=reply,
            citations=[LLMCitation(chunk_id="how-to-open-an-account#faq-4", quote=DOCS)],
        )

    retrieved = index.search(["documents needed to open an account"])
    return make_draft(FakeProvider({LLMDraft: responder}), ticket, ["docs"], "en", retrieved, 1.0)[
        0
    ]


def test_invented_document_type_forces_abstain(index: BM25Index) -> None:
    """Real quote, invented policy: the substring check alone would let this through."""
    draft = _docs_run(
        index,
        "You need a proof of identification, such as a passport or a driving licence.",
        "Is a driving licence accepted?",
    )
    assert draft.abstained and draft.problems == ["ungrounded_term: passport"]


def test_term_the_kb_never_mentions_makes_the_draft_partial(index: BM25Index) -> None:
    draft = _docs_run(
        index,
        "We require a Proof of identification and a Proof of address not older than 6 months.",
        "Is a driving licence accepted?",
    )
    assert not draft.abstained and draft.coverage == "partial"
    assert draft.unanswered_terms == ["driving licence"]
