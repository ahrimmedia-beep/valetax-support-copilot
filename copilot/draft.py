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
from copilot.models import Citation, Draft, LLMCitation, LLMDraft, ScoredChunk, Usage
from copilot.prompts import DRAFT_SYSTEM, draft_user
from copilot.templates import holding_reply

MIN_QUOTE_CHARS = 15


def normalize(text: str) -> str:
    """Make the substring check robust to formatting, not to wording: case, whitespace,
    quote characters, dashes and control characters are ignored; words are not."""
    text = unicodedata.normalize("NFKC", text).casefold()
    text = re.sub(r"[\"'‘’“”`\x00-\x1f\x7f]", " ", text)
    text = re.sub(r"[–—]", "-", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.strip(" .!?,;:-")


def verify_citations(
    citations: list[LLMCitation], retrieved: list[ScoredChunk]
) -> tuple[list[Citation], list[str]]:
    by_id = {sc.chunk.id: sc.chunk for sc in retrieved}
    valid: list[Citation] = []
    problems: list[str] = []
    for c in citations:
        chunk = by_id.get(c.chunk_id)
        quote = normalize(c.quote)
        if chunk is None:
            problems.append(f"citation_check_failed: unknown chunk {c.chunk_id}")
        elif len(quote) < MIN_QUOTE_CHARS:
            problems.append(f"citation_check_failed: quote too short {c.quote!r}")
        elif quote not in normalize(chunk.text):
            problems.append(f"citation_check_failed: quote not in {c.chunk_id}: {c.quote!r}")
        else:
            valid.append(
                Citation(chunk_id=chunk.id, page=chunk.url, heading=chunk.heading, quote=c.quote)
            )
    return valid, problems


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

    if out.covered == "none" or not out.reply.strip():
        return abstain(language, ["kb_not_covered"]), usage

    citations, problems = verify_citations(out.citations, retrieved)
    counts = {"citations_proposed": len(out.citations), "citations_valid": len(citations)}
    if not out.citations:
        problems.append("citation_check_failed: no citations")
    cited_chunks = [
        sc.chunk.text for sc in retrieved if sc.chunk.id in {c.chunk_id for c in citations}
    ]
    bad_numbers = ungrounded_numbers(out.reply, [*cited_chunks, ticket_text])
    problems += [f"ungrounded_number: {n}" for n in bad_numbers]
    cited_text = " ".join(cited_chunks)
    kb_terms = guardrails.specific_terms(cited_text)
    ticket_terms = guardrails.specific_terms(ticket_text)
    invented = guardrails.specific_terms(out.reply) - kb_terms - ticket_terms
    problems += [f"ungrounded_term: {t}" for t in sorted(invented)]
    problems += [f"unsafe_reply: {p}" for p in guardrails.scan_reply(out.reply)]
    if problems:
        return abstain(language, problems).model_copy(update=counts), usage

    # The customer named something (a payment method, a document...) the cited KB text never
    # mentions: whatever the model thinks, that part is not answered.
    unanswered = sorted(ticket_terms - kb_terms)
    coverage = "partial" if unanswered else out.covered
    draft = Draft(
        reply=out.reply.strip(),
        citations=citations,
        coverage=coverage,
        unanswered_terms=unanswered,
        **counts,
    )
    return draft, usage
