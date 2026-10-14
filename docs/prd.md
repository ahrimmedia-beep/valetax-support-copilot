# PRD: Support co-pilot for a retail forex/CFD broker

| | |
|---|---|
| Status | Phase 1 built, Phase 2 designed |
| Owner | Ievgen Akhrimienko |
| Inputs | The test brief; four public Valetax help pages; public review sites (themes only) |
| Related | [architecture.md](architecture.md) · [business-case.md](business-case.md) · [phase-2.md](phase-2.md) · [decisions.md](decisions.md) · [kb-audit.md](kb-audit.md) · [build-log.md](build-log.md) |

## 1. Problem

The support team answers the same questions about deposits, withdrawals, account opening and
verification again and again: about 10,000 tickets a month, in many languages (the site has 13).
Customers also arrive with money stuck in a withdrawal, a bonus removed, an account frozen, or
a request for trading advice. Those tickets carry regulatory risk: a wrong fee, a promised KYC
outcome or a "buy gold now" reply cannot be taken back.

Agents need help with the repetitive part, and a hard stop on the risky part.

## 2. Users

| User | Needs | What they get |
|---|---|---|
| Support agent | Answer faster without checking four help pages | A draft in the customer's language, every fact linked to the exact sentence on the help page, a route with reasons, one-click "send / edit / reject" |
| Team lead | Know which tickets need a senior person | `human_review` with machine-readable reasons (money_issue, kyc_aml, complaint, legal_threat…) |
| Compliance | Proof that no advice and no outcomes were given | Deterministic rules before and after the model, fixed decline text, an audit record per ticket |
| Content owner | Know what the help centre is missing | Abstain reasons and the KB audit (gaps and contradictions in the four pages) |
| Management | Is this worth running, in which configuration | One-page interactive business case |

## 3. Goals and non-goals

**Goals**
1. Classify every ticket: category, urgency, language, sentiment.
2. Draft a reply grounded only in the knowledge base, with citations, or abstain.
3. Route to a person whenever a hard rule or a risk signal requires it.
4. Measure it: hard-rule violations, routing accuracy, citation validity, cost, latency.
5. Show whether it pays off at 10,000 tickets a month, and with which model.

**Non-goals (Phase 1)**
- Sending anything to a customer automatically.
- Answering from anything other than the four public pages (no internal SOPs yet, no model knowledge).
- Deciding complaints, KYC or AML cases.
- A live voice bot that talks to customers. Voice is an intake channel: the transcript goes through the same checks and the agent sees a draft.

## 4. Functional requirements

Each requirement maps to the brief, to the code that implements it and to the check that proves it.

| # | Requirement | Brief | Implemented in | Verified by |
|---|---|---|---|---|
| F1 | Classify category, urgency, language, sentiment | "Classify it" | `copilot/pipeline.py` (LLM, JSON schema from `copilot/models.py`) | Eval: per-field accuracy |
| F2 | Draft only from KB, cite the pages used | "Draft a reply grounded in the knowledge base, with citations" | `copilot/draft.py`, `copilot/prompts.py`, `copilot/retrieval.py` | `tests/test_draft.py`, `tests/test_sentence_grounding.py`; eval: citation validity |
| F3 | Abstain when the KB does not cover the question | "or abstain" | `copilot/draft.py` (`abstain`), `copilot/templates.py` | Eval: uncovered questions never claimed as answered |
| F4 | Route to a person when required | "Route to a human reviewer whenever required" | `copilot/routing.py` (code table) | `tests/test_routing.py`; eval: routing accuracy, sensitive tickets auto-drafted = 0 |
| F5 | Detect trading-advice requests and decline politely | Hard rule 1 | `copilot/guardrails.py` (regex, 6 languages), `copilot/templates.py` (fixed decline) | `tests/test_guardrails.py`; eval: violations = 0 |
| F6 | Never decide complaint, KYC, AML outcomes | Hard rule 2 | `guardrails.scan` flags → `human_review`; `guardrails.scan_reply` rejects promised outcomes | Tests + eval |
| F7 | Never invent policy, fees, timelines | Hard rule 3 | Verbatim quote check, numbers and named terms per sentence must be in that sentence's cited chunk | `tests/test_sentence_grounding.py`; eval |
| F8 | Agent UI | "A minimal CLI or simple web page" | CLI `copilot triage`; operator console `copilot serve` (`copilot/web/`) | `tests/test_web.py`, screenshots |
| F9 | Voice intake (beyond the brief) | — | `copilot/voice.py`, `POST /api/voice` | `tests/test_voice.py`; `eval/voice_eval.py` |
| F10 | Agent feedback capture | Phase 1 → 2 data loop | `POST /api/feedback` → `data/feedback.jsonl` | `tests/test_web.py` |
| F11 | Business case on one page | "Business case in numbers" | `copilot/web/static/business-case.html`, `docs/business-case.md` | Formula checked against the doc's tables |

## 5. Hard rules: how each one is enforced

The model proposes; code decides. Every rule has a deterministic layer that does not depend on
the model behaving.

| Rule | Before the model | After the model | If in doubt |
|---|---|---|---|
| No trading advice | Regex in 6 languages; rewritten search queries re-filtered | Reply scanned for advice; the decline text is a fixed template, never model-written | Decline + answer only the support part |
| No complaint / KYC / AML outcomes | Regex flags force `human_review` | Reply scanned for promised or ruled-out outcomes | `human_review` |
| No invented policy, fees, timelines | Model sees only retrieved KB chunks | Every quote verbatim in its chunk; every sentence of type `fact` cites a chunk; every number and named term in a sentence appears in that sentence's own sources or the ticket | Holding reply ("a colleague will follow up") + `human_review` |

## 6. Non-functional requirements

| Area | Requirement | Phase 1 status |
|---|---|---|
| Safety | Fail closed: any LLM error, schema error or failed check → holding reply + `human_review` | Done |
| Privacy | Card numbers, e-mails, IBANs, phones removed before any LLM call | Done (regex); NER in Phase 2 |
| Audit | Each result carries input SHA-256, model, prompt version, KB version hash, chunk ids, tokens, cost, latency, step trace | Done |
| Latency | p95 under 5 s per ticket | Measured in eval |
| Cost | Under $0.01 per ticket | Measured in eval |
| Testability | Tests, lint and types run offline with no API key (fake providers) | Done, CI on GitHub Actions |
| Languages | Reply in the customer's language; RTL rendering for Arabic and Kurdish | Done |
| Portability | LLM and speech vendors behind small interfaces (`LLMProvider`, `SpeechProvider`) | Done |

## 7. Phases

| | Phase 1: ship (this repo) | Phase 2: scale ([phase-2.md](phase-2.md)) |
|---|---|---|
| Channel | Operator console, CLI, voice upload | Helpdesk / LiveChat webhook, draft as an internal note |
| Sending | Never automatic | Auto-send only for a whitelist earned with agent data |
| Retrieval | BM25 over 29 chunks | Hybrid BM25 + multilingual embeddings + reranker, chunk owners and review dates |
| Quality | Labelled eval run by hand | Eval in CI on every prompt, KB or model change; grows weekly from agent edits |
| Ops | Retries, timeout, cost per ticket | Queue, idempotency, cache, fallback model, budget cap, dashboards |

## 8. Success metrics

| Metric | Target | Where measured |
|---|---|---|
| Hard-rule violations | 0 | `eval/report.md` |
| Sensitive tickets auto-drafted | 0 | `eval/report.md` |
| Routing accuracy | ≥ 90% | `eval/report.md` |
| Citation validity | 100% | `eval/report.md` |
| Voice: route agreement with the text version | ≥ 90% | `eval/voice_report.md` |
| In production: agent "sent as is" share on `auto_draft` | Baseline in pilot, then up | `/api/feedback/stats` |
| In production: average handle time | −2 min per ticket or better | Helpdesk data in the pilot |

## 9. Risks

| Risk | Mitigation |
|---|---|
| KB is thin and inconsistent (see [kb-audit.md](kb-audit.md)) | Abstain instead of guessing; KB gaps reported to the content owner; the biggest business lever is KB content |
| Model writes a fact without a source | Per-sentence citation and number/term checks; agent review |
| A risky ticket phrased in a way the regex misses | LLM flags are added on top; routing can only get stricter; lists grow from weekly misses |
| Prompt injection inside a ticket | Ticket passed as data; injection patterns route to a person; routing is code |
| Vendor outage | Fails closed to `human_review`; fallback model in Phase 2 |
| Agents trust drafts blindly | Citations shown next to every sentence; feedback tracked from day one |

## 10. Open questions for the Valetax team

1. Real ticket mix by category and language, and current average handle time (replace the business-case assumptions).
2. Helpdesk in use behind LiveChat, and whether drafts can be posted as internal notes.
3. Which internal SOPs exist for withdrawals, bonuses and verification, and who owns them.
4. Compliance owner for the decline and holding-reply templates in each language.
5. Data-processing terms acceptable for an external LLM vendor (zero retention, region).
