# Business case: is it worth running at 10,000 tickets/month?

**Answer: yes.** Under the assumptions below the co-pilot saves about **400 agent-hours a
month (~2.5 FTE)**, worth **$3,200–$8,000/month**, against about **$1,144/month** to run.
Payback is **1–3 months**; break-even is **1,400–3,500 tickets/month**. The LLM bill is
about 1% of the savings, so the model should be chosen on quality, not on token price.
**Recommended configuration: gpt-4.1 for both LLM steps, gpt-4.1-mini as automatic fallback,
nothing auto-sent.**

Interactive version (change any assumption and the verdict updates):
`copilot serve`, then open `/business-case`
([screenshot](screenshots/business-case.png)).

Measured numbers come from `eval/` (51 labelled tickets, plus 20 real-theme tickets for
gpt-4.1), prompt version `v2-…-sentences`. Everything marked *assumption* must be replaced
with the support team's real numbers before a decision.

## Inputs

| Input | Value | Source |
|---|---|---|
| Tickets per month | 10,000 | brief |
| Agent handle time today | 6 min/ticket (1,000 h/month, ~6.3 FTE) | *assumption* |
| Handle time with co-pilot: `auto_draft` (check citations, send) | 2 min | *assumption* |
| Handle time with co-pilot: `decline_trading_advice` (fixed template) | 1 min | *assumption* |
| Handle time with co-pilot: `human_review` (pre-classified, reasons, draft or holding reply, citations) | 5 min | *assumption* (1 min saved) |
| Route mix in production, over all tickets: auto_draft / decline / human_review | 40% / 5% / 55% | *assumption*; tickets outside the four KB topics mostly land in `human_review`. The eval set is deliberately adversarial (31% gold auto_draft), so its mix is not used |
| Loaded agent cost | $8/h (offshore) and $20/h | *assumption*, two scenarios |
| LLM cost per ticket | $0.0044 (gpt-4.1), $0.00095 (gpt-4.1-mini) | **measured**, `eval/summary.json`, `eval/runs/v2-gpt-4.1-mini/summary.json` |
| Running cost: 0.1 FTE engineer for upkeep + hosting + weekly review | $1,100/month | *assumption* |
| One-time Phase 1 rollout (helpdesk integration, shadow mode, training) | $6,000 (~3 engineer-weeks) | *assumption* |

## Result (gpt-4.1, 40% auto_draft)

Average handle time: 0.40×2 + 0.05×1 + 0.55×5 = **3.6 min** (from 6). Saved 2.4 min × 10,000
= **400 h/month**.

| | $8/h | $20/h |
|---|---|---|
| Gross saving | $3,200 | $8,000 |
| Running cost (LLM $44 + $1,100) | $1,144 | $1,144 |
| **Net per month** | **$2,056** | **$6,856** |
| Payback of $6,000 rollout | 2.9 months | 0.9 months |
| Break-even volume | ~3,490 tickets/month | ~1,380 tickets/month |

Sensitivity (net per month, rounded to $10):

| auto_draft share | Saved hours | Net at $8/h | Net at $20/h |
|---|---|---|---|
| 25% (KB stays as is) | 325 | $1,460 | $5,360 |
| 40% (base) | 400 | $2,060 | $6,860 |
| 55% (after the KB gaps in `kb-audit.md` are filled) | 475 | $2,660 | $8,360 |
| 40%, but `human_review` saves nothing (6 min) | 308 | $1,320 | $5,020 |

Even the pessimistic rows stay positive. The biggest lever is **KB content**, not the model:
every 10 points of tickets moved from `human_review` to `auto_draft` is ~50 h/month. The
real-theme eval shows where those points are: USDT fees, local bank deposits (MYR, IDR),
bonus rules and withdrawal delays are all asked about and none is in the four pages.

## Configurations compared

| Config | LLM $/ticket | $/month @10k | Quality on the eval | Verdict |
|---|---|---|---|---|
| A. gpt-4.1-nano | $0.0002 | $2 | Routing 82% (first prompt version, not re-run). Read "What is the maximum leverage you offer?" as advice; 7 of 10 plain declines went to humans; once drafted "Yes, a driving licence is accepted" | Rejected |
| B. gpt-4.1-mini | $0.00095 | $10 | 0 violations, routing 96%, citations 100%, strict abstain recall 93%, p95 3.0 s (run before the last tightening of output checks) | Fallback |
| **C. gpt-4.1** | **$0.0044** | **$44** | **0 violations, routing 96%, citations 100%, strict abstain recall 100%, p50 1.6 s / p95 2.7 s. Real-theme set (20 tickets, 8 languages): 0 violations, routing 100%** | **Recommended** |
| D. mini, escalate to gpt-4.1 on abstain | ~$0.002 (est.) | ~$20 | Not built. Abstains come from KB gaps, so a bigger model has nothing more to quote | Not worth the complexity |
| E. Phase 2: C + embeddings + reranker + queue + audit store | ~$0.006 (est.) | ~$60 + ~$300 infra | Needed when the KB grows past tens of pages; no benefit on 4 pages | Later (`phase-2.md`) |
| Voice intake (any config) | + transcription per minute of audio at the vendor's list price | small next to agent time | Voice eval: route identical to the text version on 8/8 tickets | Optional channel |

B and C are tied on routing and safety within the noise of 51 tickets. C wins on abstention
discipline, and the difference is $34/month: one wrong answer about money costs more than a
year of it. B is a credible budget option and the automatic fallback.

## Risks and what covers each

| Risk | Covered by |
|---|---|
| Wrong answer about money (fee, timeline, method) | Every fact sentence must cite a KB chunk; every number and named term in it must be in that sentence's own sources or the ticket; timelines and "free" are banned from courtesy sentences; stuck or rejected money always goes to a person (`money_issue`); nothing is sent without an agent |
| Trading advice | Regex before the LLM + LLM category, fixed compliance-approved decline text, LLM output scanned for advice |
| Deciding a complaint, KYC or AML outcome | Regex + LLM topic flags force `human_review`; output scanned for promised or ruled-out outcomes |
| Invented policy | Quotes verified verbatim against the cited chunk; any failed check means abstain |
| Prompt injection | Ticket passed as data, injection patterns go to a human, routing is code |
| Customer data sent to the LLM vendor | Cards, e-mails, IBANs and phones are redacted before any call (Phase 2: names, documents, zero-retention agreement) |
| Agents trust drafts blindly, or ignore them | Each sentence shown next to its quote; "sent as is / edited / rejected" logged from day one (`/api/feedback`) |
| LLM outage | Fails closed: holding reply + `human_review`; fallback model |

## What would change the answer

The case turns negative only if the real average saving is below ~0.86 min per ticket at $8/h
(~0.34 min at $20/h). Measure it in a two-week assist-mode pilot before full rollout.
