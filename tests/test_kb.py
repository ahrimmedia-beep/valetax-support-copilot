from __future__ import annotations

from pathlib import Path

from copilot.kb import chunk_page, kb_version
from copilot.kb_extract import SOURCES, to_markdown
from copilot.models import Chunk

KB = Path(__file__).resolve().parent.parent / "kb"


def test_every_page_is_chunked(chunks: list[Chunk]) -> None:
    assert {c.page for c in chunks} == set(SOURCES)
    assert sum(c.id.endswith("#steps") for c in chunks) == 4
    assert len(chunks) == 4 + 9 + 9 + 7  # steps + deposit FAQ + withdraw FAQ + account FAQ


def test_chunks_keep_url_and_heading(chunks: list[Chunk]) -> None:
    for c in chunks:
        assert c.url.startswith("https://valetax.com/")
        assert c.heading and c.text


def test_every_faq_question_has_an_answer(chunks: list[Chunk]) -> None:
    for c in chunks:
        if "#faq-" in c.id:
            question, answer = c.text.split("\n", 1)
            assert question == c.heading and len(answer) > 20


def test_heading_without_answer_is_dropped() -> None:
    md = "---\nurl: https://x/\n---\n# T\n\n## FAQ: Q\n\n### Empty?\n\n### Full?\n\nYes it is.\n"
    ids = [c.id for c in chunk_page("t", md)]
    assert ids == ["t#steps", "t#faq-2"]


def test_kb_files_match_raw_html() -> None:
    """kb/*.md is generated from the saved pages; nobody edited the KB by hand."""
    for slug in SOURCES:
        raw = (KB / "raw" / f"{slug}.html").read_text(encoding="utf-8")
        assert to_markdown(slug, raw) == (KB / f"{slug}.md").read_text(encoding="utf-8")


def test_kb_version_is_stable() -> None:
    assert kb_version() == kb_version() and len(kb_version()) == 12
