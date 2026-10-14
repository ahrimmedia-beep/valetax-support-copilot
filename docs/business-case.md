# Business case: is it worth running at 10,000 tickets/month?

**Answer: yes.** Under the assumptions below the co-pilot saves about **400 agent-hours a
month (~2.5 FTE)**, worth **$3,200–$8,000/month**, against about **$1,140/month** to run.
Payback is **1–3 months**; break-even is **1,400–3,500 tickets/month**. The LLM bill is
about 1% of the savings, so the model should be chosen on quality, not on token price.
**Recommended configuration: gpt-4.1 for both LLM steps, gpt-4.1-mini as automatic fallback,
nothing auto-sent.**

Measured numbers come from `eval/` (51 labelled tickets, two runs per model). Everything
marked *assumption* must be replaced with the support team's real numbers before a decision.

## Inputs

| Input | Value | Source |
|---|---|---|
| Tickets per month | 10,000 | brief |
| Share in the 4 KB categories | 60% | *assumption* |
| Agent handle time today | 6 min/ticket (1,000 h/month, ~6.3 FTE) | *assumption* |
| Handle time with co-pilot: `auto_draft` (check citation, send) | 2 min | *assumption* |
| Handle time with co-pilot: `decline_trading_advice` (fixed template) | 1 min | *assumption* |
| Handle time with co-pilot: `human_review` (pre-classified, draft or holding reply, citations) | 5 min | *assumption* (1 min saved) |
| Route mix in production: auto_draft / decline / human_review | 40% / 5% / 55% | *assumption*; the eval set is deliberately adversarial (31% gold auto_draft) so its mix is not used |
| Loaded agent cost | $8/h (offshore) and $20/h | *assumption*, two scenarios |
| LLM cost per ticket | $0.0037 (gpt-4.1), $0.0008 (gpt-4.1-mini) | **measured**, `eval/summary.json` |
| Running cost: 0.1 FTE engineer for upkeep + hosting + weekly review | $1,100/month | *assumption* |
| One-time Phase 1 rollout (helpdesk integration, shadow mode, training) | $6,000 (~3 engineer-weeks) | *assumption* |

## Result (gpt-4.1, 40% auto_draft)

Average handle time: 0.40×2 + 0.05×1 + 0.55×5 = **3.6 min** (from 6). Saved 2.4 min × 10,000
= **400 h/month**.

| | $8/h | $20/h |
|---|---|---|
| Gross saving | $3,200 | $8,000 |
| Running cost (LLM $37 + $1,100) | $1,137 | $1,137 |
| **Net per month** | **$2,063** | **$6,863** |
| Payback of $6,000 rollout | 2.9 months | 0.9 months |
| Break-even volume | 3,480 tickets/month | 1,380 tickets/month |

Sensitivity (net per month):

| auto_draft share | Saved hours | Net at $8/h | Net at $20/h |
|---|---|---|---|
| 25% (KB stays as is) | 325 | $1,460 | $5,360 |
| 40% (base) | 400 | $2,060 | $6,860 |
| 55% (after the KB gaps in `kb-audit.md` are filled) | 475 | $2,660 | $8,360 |
| 40%, but `human_review` saves nothing (6 min) | 308 | $1,330 | $5,030 |

Even the pessimistic rows stay positive. The biggest lever is **KB content**, not the model:
every 10 points of tickets moved from `human_review` to `auto_draft` is ~50 h/month.

## Configurations compared

| Config | LLM $/ticket | $/month @10k | Quality on the eval (2 runs where shown) | Verdict |
|---|---|---|---|---|
| A. gpt-4.1-nano | $0.0002 | $2 | Routing 82%. Read "What is the maximum leverage you offer?" as advice; kept trading questions as KB queries, so 7 of 10 plain declines went to humans. In a development run it drafted "Yes, a driving licence is accepted" (routing caught it, the text was still wrong) | Rejected |
| B. gpt-4.1-mini | $0.0008 | $8 | 0 violations ×2, routing 96% ×2, sensitive auto-drafted 0. Writes `partial` drafts where gpt-4.1 abstains cleanly (strict abstain recall ~70%) | Fallback |
| **C. gpt-4.1** | **$0.0037** | **$37** | **0 violations ×2, routing 96% ×2, strict abstain recall 100%, p95 2.9 s** | **Recommended** |
| D. mini, escalate to gpt-4.1 on abstain | ~$0.0017 (est.) | ~$17 | Not built. All 14 uncovered tickets were uncovered for every model: abstains come from KB gaps, so a bigger model has nothing more to quote | Not worth the complexity |
| E. Phase 2: C + embeddings + reranker + queue + audit store | ~$0.006 (est.) | ~$60 + ~$300 infra | Needed when the KB grows past tens of pages; no benefit on 4 pages | Later (`phase-2.md`) |

B and C are tied on routing and safety within the noise of 51 tickets. C wins on abstention
discipline and latency, and the difference is $29/month: one wrong answer about money costs
more than a year of it.

## Risks and what covers each

| Risk | Covered by |
|---|---|
| Wrong answer about money (fee, timeline, method) | Every number and named term (fee, limit, Skrill, USDT, passport…) in a draft must appear in a cited KB chunk or the ticket, otherwise the draft is replaced by a holding reply; stuck/rejected money always goes to a person (`money_issue`); nothing is sent without an agent |
| Trading advice | Regex before the LLM + LLM category, fixed compliance-approved decline text, LLM output scanned for advice |
| Deciding a complaint, KYC or AML outcome | Regex + LLM topic flags force `human_review`; output scanned for promised or ruled-out outcomes |
| Invented policy | Quotes verified verbatim against the cited chunk; any failed check means abstain |
| Prompt injection | Ticket passed as data, injection patterns go to a human, routing is code |
| Customer data sent to the LLM vendor | Cards, e-mails, IBANs and phones are redacted before any call (Phase 2: names, documents, zero-retention agreement) |
| Agents trust drafts blindly, or ignore them | Track "sent as is / edited / rewritten" from day one; weekly review (`phase-2.md`) |
| LLM outage | Fails closed: holding reply + `human_review`; fallback model |

## What would change the answer

The case turns negative only if the real average saving is below ~0.9 min per ticket at $8/h
(~0.35 min at $20/h). Measure it in a two-week assist-mode pilot before full rollout.
