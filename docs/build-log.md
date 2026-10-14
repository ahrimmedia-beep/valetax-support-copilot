# Build log

How the work was organised, in order, with time spent. Built with an agentic coding tool, as
the brief allows; I set the scope, the architecture and the rules, wrote the specs each
workstream was built from, reviewed every change and made every product decision.

## Day 1, 13 Oct: a working pipeline with numbers (~6 h)

| Stage | What came out |
|---|---|
| Brief and KB | Read the four help pages, saved HTML snapshots, wrote the HTML → Markdown extractor; logged gaps and contradictions as I went ([kb-audit.md](kb-audit.md)) |
| Design | Fixed pipeline over an agent; deterministic guardrails first; routing as a code table; fail closed ([decisions.md](decisions.md)) |
| Pipeline | Guardrails in 6 languages, PII redaction, classification, BM25, grounded draft with verbatim quote check, routing, CLI, offline fake provider |
| Eval | 51 labelled tickets, runner, three models compared (gpt-4.1, mini, nano), two runs each for the finalists |
| Business case, Phase 2 | One-page case with sensitivity; scaling plan |

Result: 0 hard-rule violations, 96% routing, $0.0037 per ticket, 78 offline tests, CI.

## Day 2, 14 Oct: from a pipeline to a product (~3 h)

What day 1 left open: no screen for agents, synthetic tickets only, and a known gap: a
citation proved a quote exists, not that each sentence of the reply follows from it.

| Time | Stage | What came out |
|---|---|---|
| 12:00–12:20 | Review of day 1 | List of gaps above |
| 12:20–12:30 | Research on the company | Brand (fonts, colours from the public CSS), support channels (LiveChat), 13 site languages, recurring themes in public reviews |
| 12:20–12:35 | Scope and architecture | Added: operator console, voice intake, sentence-level grounding, real-world theme tickets, interactive business case. Rejected: a live voice bot (it would speak before code can check the reply) |
| 12:35–12:42 | Contracts and plan | Shared data contracts (`DraftSentence`, `TraceStep`) and the web API table written first, so six workstreams could run in parallel without touching each other's files |
| 12:42–12:56 | Parallel build | Voice module; web API with step trace; sentence-level grounding; 20 real-theme tickets in 8 languages; business-case page; operator console in two competing designs |
| 12:43–12:56 | Reviews | Each workstream reviewed separately against its spec. Findings fixed before merge: upload size checked only after parsing, blocking calls on the event loop, vendor error text reaching the browser, three ways to hide a timeline or a "free" claim in a greeting, and over-strict rules that rejected "Have a nice day" |
| 12:50–12:56 | Evals on the real model | Core 51: 0 violations, 96% routing. Real-world 20: 0 violations, 100% routing. Voice 8/8. Mini re-measured |
| 12:56–13:05 | Design choice | Both console designs compared side by side on the real model; one chosen, with the other's top bar |
| 13:00–13:10 | Docs | PRD, architecture, business case updated to the new measurements, README |
| 13:05–13:20 | Final review and fixes | Whole-branch review for hard-rule paths, XSS, contract mismatches and doc accuracy. Fixed: a case outcome or advice in past tense or in Spanish/Arabic could ride in a courtesy sentence; vendor error text could reach the browser; paid endpoints had no token or rate limit. Evals re-run, docs updated to the new numbers |
| 13:20– | Release checks | Tests, lint, types, secret scan, CI |

Result: 227 offline tests, operator console, voice channel, 71 labelled tickets in 10
languages, per-sentence grounding, every number in the docs traceable to an eval report.

## How the work was checked

- Every change was built against a written spec and reviewed by a separate pass that read
  the diff, not the author's summary.
- Every claim in the docs about results points to a generated report in `eval/`.
- Tests, lint and types run offline in CI with fake providers; no key is needed to check
  the repository.
