# Design decisions

Short records of the choices that shape the co-pilot: context, decision, why, and what
would make me change it.

## 1. Deterministic guardrails run before the LLM, and can only make routing stricter

**Context.** The hard rules (no trading advice, no KYC/AML/complaint outcomes) are the
costly failures. An LLM classifier is good but not guaranteed, and it can be talked out of
things by the ticket text.
**Decision.** Regex detectors in six languages run first, with no network. Routing ORs
their flags with the LLM's flags. The LLM can add a flag, never remove one.
**Why.** Predictable, testable line by line, free, immune to prompt injection. The LLM covers
phrasing the lists miss.
**Trade-off.** Keyword lists over-trigger ("refund" makes a ticket a complaint). That costs a
human review, not a wrong answer. Lists grow from the weekly review of misses.

## 2. Nothing is sent to a customer automatically in Phase 1

**Decision.** Every output is a draft for an agent. `auto_draft` means "can be sent after a
glance", not "sent".
**Why.** No production data yet on how often drafts are right. A wrong answer about money in
a regulated business costs more than the minutes saved. The agent's action (sent as is /
edited / rewritten) becomes the data that can later justify auto-send for a narrow whitelist
(`phase-2.md`, section 6).

## 3. Two LLM calls with structured output, not an agent loop

**Decision.** Call 1 classifies and rewrites the questions; call 2 drafts from retrieved
chunks. Both use JSON schema output generated from Pydantic models, temperature 0, three
retries and a 30 s timeout.
**Why.** Fixed cost and latency per ticket, each step testable on its own, and a schema
violation is an error, not a guess. A tool-using agent adds non-determinism without a need:
the flow is the same for every ticket.

## 4. The classifier writes English search queries

**Context.** The KB is English; tickets arrive in Russian, Arabic, Hindi, Indonesian, Spanish.
**Decision.** `Classification.kb_questions` holds one short English query per support
question, without trading-advice requests (and a regex filter double-checks that).
**Why.** One call gives multilingual retrieval, splits multi-question tickets, and drops
advice requests before retrieval. 100% language accuracy and correct citations for
non-English tickets in the eval.

## 5. BM25 in Phase 1, no vector database

**Context.** 4 pages, 29 chunks, ~7 KB of text.
**Decision.** Hand-written BM25 (~100 lines) with a Snowball stemmer and a small synonym map.
**Why.** Deterministic, explainable, no service to run, microseconds per query. A vector DB
would be infrastructure for 29 rows. I also considered putting the whole KB in the prompt
(~2k tokens): it works at this size, but it does not scale and it makes the model cite less
precisely. BM25 sits behind the same `search()` interface that embeddings + a reranker will
use in Phase 2.
**Known weakness.** Lexical gaps ("euros" vs "currencies"). The query rewriting instruction
closes most of them; embeddings close the rest later.

## 6. One chunk per FAQ answer or per page's steps; KB kept as is

**Decision.** `kb/*.md` is generated from the saved HTML by `kb_extract.py` (a test checks
nobody edited it by hand). Chunks keep page URL and heading. Typos, duplicates and
contradictions stay (`kb-audit.md`). Identical chunks (the withdraw page copies the deposit
FAQ) are collapsed at retrieval time, preferring the page the question is about.
**Why.** The co-pilot must be honest about what the company actually published. Fixing the
pages is the support team's job, and the audit tells them what to fix.

## 7. Citations are checked by code, and so are numbers and named terms

**Decision.** Each citation must point to a retrieved chunk and its quote must be a substring
of that chunk (case, whitespace and quote characters ignored, words not). Then:
every number in the reply must appear in a cited chunk or the ticket, and every named
term (passport, Skrill, USDT, fee, limit, refund, regulation…) must too.
**Why.** A substring check proves the quote exists, not that the reply says what the quote
says. During development a small model quoted the real "Proof of identification" sentence
and wrote "such as a passport or a driving licence". The number and term checks catch exactly
the invented fees, timelines, methods and documents the hard rules are about.
**Limit.** A reworded false claim with no number and no listed term can still pass; that is
why every draft is reviewed. Phase 2 can add an entailment check per sentence.

## 8. Any failed check means abstain, with a fixed holding reply

**Decision.** No "repair" loop. If a check fails or the model says the KB does not cover it,
the reply becomes a fixed holding message in the customer's language and the ticket goes to
`human_review` with the reason.
**Why.** A retry loop hides problems and doubles cost. A clean abstain is easy for an agent
to handle and easy to measure.

## 9. Routing is a table in code, not an LLM decision

**Decision.** `routing.py`: complaint, KYC/AML, blocked account, legal threat, fraud, money
stuck, injection, high/critical urgency, negative sentiment on money, abstain, partial
coverage, a term the KB does not cover, or any pipeline error: `human_review`. Otherwise
trading advice: `decline_trading_advice`. Otherwise `auto_draft`. Human review wins over
decline; reasons are always listed.
**Why.** Compliance can read and sign off a table. Every routing decision is explainable
from the reasons list.

## 10. Trading advice: fixed decline text; factual questions still answered

**Decision.** Declines use a static template (six languages), never LLM text. "What is the
maximum leverage you offer?" is a fact and gets a KB answer; "Should I use 1:1000?" is a
suggestion and gets the decline. If a ticket mixes both, the KB answer is appended after
the decline.
**Note.** The KB itself answers "What leverage settings should I select?". Policy wins over
the KB here (`kb-audit.md`, item 9).

## 11. Fail closed

**Decision.** If the LLM is down, times out or returns something unparseable, the ticket
still gets a safe default classification, the holding reply and `human_review`
(`pipeline_error`). Tested offline.

## 12. An offline fake provider for tests; the eval uses the real model

**Decision.** `FakeProvider` implements the same interface with deterministic heuristics
and injectable responses. All offline tests run free, in under a second; CI needs no
key. `eval/run.py` runs the real model and its report is committed.
**Why.** Unit tests check our code (checks, routing, failure handling), including cases a
real model rarely produces on demand (fabricated quotes, outages). The eval checks the model.

## 13. Model choice was measured, and price was not the deciding factor

**Decision.** gpt-4.1 by default, gpt-4.1-mini as fallback. Evaluated nano, mini and 4.1, two
runs each for mini and 4.1.
**Why.** At 10k tickets/month the LLM costs $2–$37/month, about 1% of the labour saved
(`business-case.md`). Mini and 4.1 tie on safety and routing; 4.1 abstains more cleanly and
is faster. Nano misroutes and once invented a document policy. Re-decide on shadow-mode data.

## 14. PII is redacted before any LLM call

**Decision.** Card numbers (Luhn-checked), e-mails, IBANs and phone numbers are replaced with
placeholders before the text leaves the process. Amounts and account-sized numbers are kept.
**Why.** The model does not need them to answer, and fintech data should not go to a vendor
without a reason. A test asserts the card number never reaches the provider.
