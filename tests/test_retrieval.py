from __future__ import annotations

from copilot.retrieval import BM25Index, tokenize


def test_tokenize_stems_and_drops_stopwords() -> None:
    assert tokenize("How do I withdraw my withdrawals?") == ["withdraw", "withdraw"]
    assert tokenize("verification") == tokenize("verify")


def test_minimum_deposit(index: BM25Index) -> None:
    top = index.search(["minimum deposit amount"])[0]
    assert top.chunk.id == "how-to-deposit#faq-1"


def test_duplicated_faq_is_collapsed_and_page_preferred(index: BM25Index) -> None:
    hits = index.search(["withdrawal pending status"])
    texts = [h.chunk.text for h in hits]
    assert len(texts) == len(set(texts))
    assert hits[0].chunk.id == "how-to-withdraw#faq-7"


def test_verification_time_found_on_another_page(index: BM25Index) -> None:
    assert index.search(["how long does verification take"])[0].chunk.id == (
        "how-to-open-an-account#faq-5"
    )


def test_unrelated_query_returns_nothing(index: BM25Index) -> None:
    assert index.search(["install MT5 on mac"]) == []


def test_multiple_queries_are_merged(index: BM25Index) -> None:
    ids = {h.chunk.id for h in index.search(["minimum deposit", "islamic account"])}
    assert {"how-to-deposit#faq-1", "how-to-open-an-account#faq-7"} <= ids
