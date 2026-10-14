"""Step 4: grounded draft, then code-side checks that decide whether the draft can be used.

The LLM is asked to answer only from the retrieved chunks and to back every fact with a
verbatim quote. We do not trust that; we check it:

  1. every citation points to a chunk that was actually retrieved for this ticket;
  2. every quote is a real substring of that chunk (after whitespace/quote normalisation);
  3. every number in the reply (amounts, hours, leverage) appears in a cited chunk or in the
     ticket itself - the cheap, strong defence against invented fees and timelines;
  4. every named document, payment method, fee, limit... in the reply appears in a cited
     chunk or in the ticket (guardrails.specific_terms);
  5. the reply contains no trading advice and no promised outcome (guardrails.scan_reply).

A citation proves that a quote exists, not that a given sentence follows from it. So the
model returns the reply sentence by sentence, each tied to the citations behind it, and
each sentence is checked against its own sources:

  6. a `fact` sentence must cite at least one verified citation (`uncited_fact`);
  7. a cite index must point to an existing citation that passed checks 1-2 (`bad_cite`);
  8. every number and specific term in a `fact` sentence must appear in the chunks that
     sentence cites or in the ticket - not merely somewhere in the reply's sources
     (`sentence_number_not_in_its_source`, `sentence_term_not_in_its_source`);
  9. a greeting, closing or handoff carries no numbers, no specific terms, no timeline,
     price or promise words (guardrails.courtesy_violations), at most MAX_COURTESY_WORDS
     words and MAX_COURTESY_CHARS characters (for scripts without spaces), so facts cannot
     hide in sentences that need no source (`fact_disguised_as_<kind>`).

Known limits:
  * a fact that cites a real quote from an unrelated chunk is accepted if its numbers and
    terms are grounded. There is no lexical-overlap check between sentence and quote,
    because replies are multilingual and quotes are English. The backstop is the agent, who
    sees the quote next to each sentence, and the eval;
  * numbers and terms that appear in the ticket count as grounded: if the customer writes
    "1 hour", a sentence repeating "1 hour" passes.

If the ticket names something the cited chunks never mention, the draft is kept but marked
`partial` (a person must answer that part).

Any failure -> the draft is discarded and replaced by a holding reply ("abstain"),
and the ticket goes to a person.
"""

from __future__ import annotations

import re
import unicodedata

from copilot import guardrails
from copilot.llm import LLMError, LLMProvider
from copilot.models import (
    Citation,
    Draft,
    DraftSentence,
    LLMCitation,
    LLMDraft,
    LLMSentence,
    ScoredChunk,
    Usage,
)
from copilot.prompts import DRAFT_SYSTEM, draft_user
from copilot.templates import holding_reply

MIN_QUOTE_CHARS = 15
MAX_COURTESY_WORDS = 30
MAX_COURTESY_CHARS = 200


def normalize(text: str) -> str:
    """Make the substring check robust to formatting, not to wording: case, whitespace,
    quote characters, dashes and control characters are ignored; words are not."""
    text = unicodedata.normalize("NFKC", text).casefold()
    text = re.sub(r"[\"'‘’“”`\x00-\x1f\x7f]", " ", text)
    text = re.sub(r"[–—]", "-", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip(" .!?,;:-")


def check_citation(c: LLMCitation, retrieved: list[ScoredChunk]) -> Citation | str:
    """The verified citation, or the reason it failed."""
    chunk = next((sc.chunk for sc in retrieved if sc.chunk.id == c.chunk_id), None)
    quote = normalize(c.quote)
    if chunk is None:
        return f"citation_check_failed: unknown chunk {c.chunk_id}"
    if len(quote) < MIN_QUOTE_CHARS:
        return f"citation_check_failed: quote too short {c.quote!r}"
    if quote not in normalize(chunk.text):
        return f"citation_check_failed: quote not in {c.chunk_id}: {c.quote!r}"
    return Citation(chunk_id=chunk.id, page=chunk.url, heading=chunk.heading, quote=c.quote)


def verify_citations(
    citations: list[LLMCitation], retrieved: list[ScoredChunk]
) -> tuple[list[Citation], list[str]]:
    return _split([check_citation(c, retrieved) for c in citations])


def _split(checked: list[Citation | str]) -> tuple[list[Citation], list[str]]:
    return [c for c in checked if isinstance(c, Citation)], [
        p for p in checked if isinstance(p, str)
    ]


def _ascii_digits(text: str) -> str:
    """Map Arabic-Indic, Devanagari and other Unicode digits to 0-9."""
    return "".join(str(unicodedata.digit(ch)) if ch.isdigit() else ch for ch in text)


def numbers_in(text: str) -> set[str]:
    text = re.sub(r"(?m)^\s*\d{1,2}[.)]\s", " ", _ascii_digits(text))  # list markers "1. "
    found = re.findall(r"\d+(?:[.,:]\d+)*", text)
    return {n.replace(",", "") for n in found}


def ungrounded_numbers(reply: str, allowed_sources: list[str]) -> list[str]:
    allowed: set[str] = set()
    for s in allowed_sources:
        allowed |= numbers_in(s)
    return sorted(numbers_in(reply) - allowed)


def abstain(language: str, problems: list[str]) -> Draft:
    return Draft(reply=holding_reply(language), abstained=True, coverage="none", problems=problems)


def _cited_chunk_ids(
    sentence: LLMSentence, checked: list[Citation | str]
) -> tuple[list[str], list[str]]:
    """Chunk ids behind a sentence (verified citations only, in order, no repeats) and the
    problems with its cite indexes."""
    chunk_ids: list[str] = []
    problems: list[str] = []
    for i in sentence.cites:
        target = checked[i] if 0 <= i < len(checked) else None
        if isinstance(target, Citation):
            if target.chunk_id not in chunk_ids:
                chunk_ids.append(target.chunk_id)
        else:
            problems.append(f"bad_cite: {i}")
    return chunk_ids, problems


def check_sentences(
    sentences: list[LLMSentence],
    checked: list[Citation | str],
    retrieved: list[ScoredChunk],
    ticket_text: str,
) -> tuple[list[DraftSentence], list[str]]:
    """Checks 6-9 of the module docstring, one sentence at a time."""
    text_of = {sc.chunk.id: sc.chunk.text for sc in retrieved}
    out: list[DraftSentence] = []
    problems: list[str] = []
    for s in sentences:
        text = s.text.strip()
        chunk_ids, cite_problems = _cited_chunk_ids(s, checked)
        problems += cite_problems
        if s.kind != "fact":
            chunk_ids = []
            too_long = len(text.split()) > MAX_COURTESY_WORDS or len(text) > MAX_COURTESY_CHARS
            if (
                numbers_in(text)
                or guardrails.specific_terms(text)
                or guardrails.courtesy_violations(text)
                or too_long
            ):
                problems.append(f"fact_disguised_as_{s.kind}: {text}")
        elif not chunk_ids:
            problems.append(f"uncited_fact: {text}")
        else:
            sources = [*(text_of[c] for c in chunk_ids), ticket_text]
            problems += [
                f"sentence_number_not_in_its_source: {n}" for n in ungrounded_numbers(text, sources)
            ]
            terms = guardrails.specific_terms(text) - guardrails.specific_terms(" ".join(sources))
            problems += [f"sentence_term_not_in_its_source: {t}" for t in sorted(terms)]
        out.append(DraftSentence(text=text, kind=s.kind, chunk_ids=chunk_ids))
    return out, problems


def make_draft(
    provider: LLMProvider,
    ticket_text: str,
    questions: list[str],
    language: str,
    retrieved: list[ScoredChunk],
    min_top_score: float,
) -> tuple[Draft, Usage]:
    usage = Usage()
    if not retrieved or retrieved[0].score < min_top_score:
        return abstain(language, ["low_retrieval_score"]), usage

    try:
        result = provider.complete_json(
            system=DRAFT_SYSTEM.replace("{language}", language),
            user=draft_user(ticket_text, questions, retrieved),
            schema=LLMDraft,
        )
    except LLMError as exc:
        return abstain(language, [f"llm_error: {exc}"]), usage
    usage.add(result.usage)
    out = result.parsed

    llm_sentences = [s for s in out.sentences if s.text.strip()]
    reply = " ".join(s.text.strip() for s in llm_sentences)
    if out.covered == "none" or not reply:
        return abstain(language, ["kb_not_covered"]), usage

    checked = [check_citation(c, retrieved) for c in out.citations]
    citations, problems = _split(checked)
    counts = {"citations_proposed": len(out.citations), "citations_valid": len(citations)}
    if not out.citations:
        problems.append("citation_check_failed: no citations")
    cited_chunks = [
        sc.chunk.text for sc in retrieved if sc.chunk.id in {c.chunk_id for c in citations}
    ]
    bad_numbers = ungrounded_numbers(reply, [*cited_chunks, ticket_text])
    problems += [f"ungrounded_number: {n}" for n in bad_numbers]
    cited_text = " ".join(cited_chunks)
    kb_terms = guardrails.specific_terms(cited_text)
    ticket_terms = guardrails.specific_terms(ticket_text)
    invented = guardrails.specific_terms(reply) - kb_terms - ticket_terms
    problems += [f"ungrounded_term: {t}" for t in sorted(invented)]
    problems += [f"unsafe_reply: {p}" for p in guardrails.scan_reply(reply)]
    sentences, sentence_problems = check_sentences(llm_sentences, checked, retrieved, ticket_text)
    problems += sentence_problems
    if problems:
        return abstain(language, problems).model_copy(update=counts), usage

    # The customer named something (a payment method, a document...) the cited KB text never
    # mentions: whatever the model thinks, that part is not answered.
    unanswered = sorted(ticket_terms - kb_terms)
    coverage = "partial" if unanswered else out.covered
    draft = Draft(
        reply=reply,
        citations=citations,
        sentences=sentences,
        coverage=coverage,
        unanswered_terms=unanswered,
        **counts,
    )
    return draft, usage
