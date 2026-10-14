# Knowledge base audit

The co-pilot can only be as good as the pages it quotes. The four public help pages were
used **as they are**: no typo fixes, no merging, no "improvements". This file lists what is
wrong or missing in them, what the co-pilot does about each issue today, and what the
support team should fix. Fixing the source is cheaper than any model.

Pages (saved 2026-10-13, `kb/raw/*.html`, converted by `copilot/kb_extract.py`):

| Page | Last modified (from page metadata) | Steps | FAQ |
|---|---|---|---|
| [How to Deposit](https://valetax.com/how-to-deposit/) | 2026-05-07 | 4 | 9 |
| [How to Withdraw](https://valetax.com/how-to-withdraw/) | 2026-06-23 | 4 | 9 (copy of deposit FAQ) |
| [How to Open an Account](https://valetax.com/how-to-open-an-account/) | 2026-05-07 | 4 | 7 |
| [How to Verify Account](https://valetax.com/how-to-verify-account/) | 2024-08-17 | 3 | none |

I checked every FAQ question against the raw HTML: each one has its answer in `kb/*.md`.
The only heading without an answer ("All set to trade?") is a call-to-action banner, not an
FAQ item, and is not in the KB.

## Errors

| # | Issue | Where | Effect on the co-pilot | What we do now |
|---|---|---|---|---|
| 1 | Withdraw steps 3–4 are copied from the deposit page: "Enter your account details and **amount to deposit**", "**Start Trading!**" | How to Withdraw, steps | A literal answer tells a customer to enter an amount *to deposit* when withdrawing | The model is told to use only source facts. In the eval it rewrote "deposit" as "the amount you wish to withdraw" (ticket `c02`). That is sensible, but it is a small step away from the source. **Fix the page.** |
| 2 | The whole withdraw FAQ is a word-for-word copy of the deposit FAQ (same 9 questions, title "Depositing and Withdrawing funds") | How to Withdraw, FAQ | Two identical chunks for every question; no withdrawal-specific facts at all | Retrieval drops duplicate texts and prefers the page the query is about, so citations point to the withdraw page for withdrawal questions |
| 3 | "Open your account with us in **3** quick and simple steps", then 4 steps are listed | How to Open an Account | Minor; a customer may quote it | Nothing |
| 4 | Typos: "in **in** queue", "**insifficient** margin", "All our account are Islamic friendly and there is no swap is credited…", mismatched quote marks around ‘Create Account‘ | Deposit/Withdraw FAQ, Account FAQ | Citations are verbatim, so agents see the typos in the quotes (customers do not: the reply is reworded) | Citation check ignores quote characters and whitespace, never words |
| 5 | "How do I sign up?" answer starts "**Click here** follow the step-by-step instructions…"; three other answers end in "**here**" | Account FAQ | The link target is lost in text; the facts behind it (account types, minimum deposit per type) are not in the KB | Answers that depend on the missing page get `partial` coverage and go to a person |

## Contradictions

| # | Statement A | Statement B | What the co-pilot does |
|---|---|---|---|
| 6 | "Deposits are **instant**!" (and the deposit page intro: "instant, simple and secure funding methods") | "…view your updated account balance **within 60 minutes**" (same answer) | Drafts quote the FAQ sentence; it never promises "instant" on its own. A customer who expected "instant" and waited 2 hours (`h01`) is routed to a person because money is not credited (`money_issue`) |
| 7 | "We've made fund withdrawals **easy and instant**" (withdraw intro) | "Should you not receive your funds **within 24 hours**, please reach out…"; status "pending… in queue" | Same: no promise of timing beyond the quoted sentence; "not received" tickets go to a person |
| 8 | "Opening a live account allows you to begin trading **immediately**" | "Account opening and document verification will be completed **within 48 hours**" and "Account verification completed! You're all set to trade" | The draft quotes the 48 hours sentence for "how long does verification take" (`c06`). Whether a customer may trade before verification is not stated anywhere; the co-pilot does not answer it |
| 9 | The KB answers "What leverage settings should I select?" ("depends on your trading strategy and goals… up to 1:2000") | Hard rule: no leverage suggestions | Policy wins. "Which leverage should I use?" is declined (`t03`, `t09`); only the factual "What is the maximum leverage you offer?" is answered (`c10`) |

## Gaps (questions customers ask that the KB cannot answer)

The verification page is the weakest: three steps, no FAQ, last updated in 2024. The only
document information in the whole KB sits on the account-opening page ("Proof of
identification and Proof of address via a bank statement or a utility bill… not older than
6 months") and does not say which identity documents are accepted.

Missing, in rough order of expected ticket volume:

1. **Withdrawals**: methods, processing time per method, fees, minimum/maximum amounts,
   whether withdrawals go back to the deposit source.
2. **Verification**: accepted identity documents (passport, national ID, driving licence?),
   file formats, review time, common rejection reasons and how to resubmit.
3. **Deposits**: list of payment methods (cards, e-wallets, crypto, local transfers), fees,
   currency conversion costs, bonuses.
4. **Compliance**: what a source-of-funds request is, what to send, what happens to the
   account meanwhile (the co-pilot will still route these to a person; a page helps the agent).
5. **Account types**: the KB links to it four times but does not include it.
6. **Company**: regulation and licences, support hours, complaint procedure.

Every one of these currently produces an abstain or a `partial` draft and a human review
(eval tickets `a01`–`a09`, `k02`). That is correct behaviour, but it is also lost savings.

## Recommendations to the support team

1. Fix errors 1–4 (one hour of editing).
2. Pick one statement per timeline (6, 7, 8) and use it everywhere.
3. Write a withdrawal FAQ and a verification FAQ with the items above; add the account-types
   page to the KB.
4. Give every page an owner and a review date. The co-pilot already records the KB version
   with each decision; Phase 2 adds a freshness check (docs/phase-2.md).
5. Measure the effect: the abstain rate per category in the eval and in production should
   drop after each new page. A page that does not move the number did not answer the
   questions customers actually ask.
