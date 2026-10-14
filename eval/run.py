"""Run the real pipeline over the labelled tickets and write a report.

    uv run python -m eval.run                         # gpt-4.1 (default) -> eval/report.md
    uv run python -m eval.run --model gpt-4.1-mini --out eval/runs/gpt-4.1-mini
    uv run python -m eval.run --provider fake --out /tmp/x   # offline smoke run

Results are appended to results.jsonl as each ticket finishes, so an interrupted run
continues where it stopped when started again with the same arguments (use --fresh to
start over). The report is rebuilt from results.jsonl at the end.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from typing import Any

from copilot import guardrails
from copilot.cli import make_provider
from copilot.draft import numbers_in
from copilot.llm import DEFAULT_MODEL
from copilot.models import Ticket, TriageResult
from copilot.pipeline import Copilot
from copilot.templates import DECLINE_TRADING_ADVICE, HOLDING_REPLY

EVAL_DIR = Path(__file__).resolve().parent
ROUTES = ["auto_draft", "human_review", "decline_trading_advice"]
URGENCY = ["low", "normal", "high", "critical"]


def load_gold(path: Path) -> list[dict[str, Any]]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def forbidden(rule: str, reply: str) -> bool:
    """`must_not_contain` entries are plain substrings, or regexes when prefixed with `re:`."""
    if rule.startswith("re:"):
        return re.search(rule[3:], reply, re.IGNORECASE) is not None
    return rule.lower() in reply.lower()


def violations(gold: dict[str, Any], r: TriageResult) -> list[str]:
    """Hard-rule violations. The target is zero."""
    reply = r.draft.reply
    found = [f"forbidden text: {s!r}" for s in gold["must_not_contain"] if forbidden(s, reply)]
    # Templates are fixed texts; only check what the model wrote.
    model_text = reply
    for t in [*DECLINE_TRADING_ADVICE.values(), *HOLDING_REPLY.values()]:
        model_text = model_text.replace(t, "")
    found += [f"unsafe reply: {p}" for p in guardrails.scan_reply(model_text)]
    allowed: set[str] = numbers_in(gold["text"])
    for c in r.draft.citations:
        allowed |= numbers_in(c.quote)
    found += [f"ungrounded number: {n}" for n in sorted(numbers_in(model_text) - allowed)]
    if gold["route"] != "auto_draft" and r.decision.route == "auto_draft":
        found.append(f"sensitive ticket auto-drafted (gold route {gold['route']})")
    return found


def pct(num: float, den: float) -> str:
    return "n/a" if den == 0 else f"{100 * num / den:.0f}% ({num:g}/{den:g})"


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    idx = min(len(values) - 1, round(q * (len(values) - 1)))
    return values[idx]


def build_report(rows: list[dict[str, Any]], meta: dict[str, str]) -> tuple[str, dict[str, Any]]:
    n = len(rows)
    g = [r["gold"] for r in rows]
    p = [TriageResult.model_validate(r["result"]) for r in rows]

    def acc(field: str) -> tuple[int, int]:
        hits = sum(
            gi[field] == getattr(pi.classification, field) for gi, pi in zip(g, p, strict=True)
        )
        return hits, n

    urg_near = sum(
        abs(URGENCY.index(gi["urgency"]) - URGENCY.index(pi.classification.urgency)) <= 1
        for gi, pi in zip(g, p, strict=True)
    )
    route_hits = sum(gi["route"] == pi.decision.route for gi, pi in zip(g, p, strict=True))
    unsafe = [
        (gi, pi)
        for gi, pi in zip(g, p, strict=True)
        if gi["route"] != "auto_draft" and pi.decision.route == "auto_draft"
    ]
    over = [
        (gi, pi)
        for gi, pi in zip(g, p, strict=True)
        if gi["route"] == "auto_draft" and pi.decision.route != "auto_draft"
    ]
    scored = [(gi, pi) for gi, pi in zip(g, p, strict=True) if gi["should_abstain"] is not None]
    tp = sum(gi["should_abstain"] and pi.draft.abstained for gi, pi in scored)
    pred_pos = sum(pi.draft.abstained for _, pi in scored)
    gold_pos = sum(bool(gi["should_abstain"]) for gi, _ in scored)
    # Safety view of abstention: on questions the KB does not answer, the model must not claim
    # full coverage (abstain or "partial" both send the ticket to a person with a hedge).
    uncovered = [(gi, pi) for gi, pi in scored if gi["should_abstain"]]
    hedged = sum(pi.draft.coverage != "full" for _, pi in uncovered)
    proposed = sum(pi.draft.citations_proposed for pi in p)
    valid = sum(pi.draft.citations_valid for pi in p)
    viol = [(gi["id"], v) for gi, pi in zip(g, p, strict=True) for v in violations(gi, pi)]
    lat = [pi.total_latency_ms for pi in p]
    cost = [pi.usage.cost_usd for pi in p]
    tokens = [pi.usage.input_tokens + pi.usage.output_tokens for pi in p]
    mix: Counter[str] = Counter(pi.decision.route for pi in p)

    summary = {
        **meta,
        "n": n,
        "category_acc": acc("category")[0] / n,
        "urgency_acc": acc("urgency")[0] / n,
        "urgency_within_1": urg_near / n,
        "language_acc": acc("language")[0] / n,
        "sentiment_acc": acc("sentiment")[0] / n,
        "route_acc": route_hits / n,
        "unsafe_auto_drafts": len(unsafe),
        "over_escalations": len(over),
        "abstain_precision": tp / pred_pos if pred_pos else None,
        "abstain_recall": tp / gold_pos if gold_pos else None,
        "uncovered_not_claimed_full": hedged / len(uncovered) if uncovered else None,
        "citation_validity": valid / proposed if proposed else None,
        "hard_rule_violations": len(viol),
        "latency_p50_ms": percentile(lat, 0.5),
        "latency_p95_ms": percentile(lat, 0.95),
        "cost_per_ticket_usd": statistics.mean(cost),
        "cost_p95_usd": percentile(cost, 0.95),
        "tokens_per_ticket": statistics.mean(tokens),
        "route_mix": {k: mix.get(k, 0) / n for k in ROUTES},
    }

    def f(x: float | None) -> str:
        return "n/a" if x is None else f"{100 * x:.0f}%"

    L = [
        f"# Eval report: {meta['model']}",
        "",
        f"Run {meta['date']}, {n} labelled tickets (`eval/tickets.jsonl`), prompt `{meta['prompt_version']}`, "
        f"KB `{meta['kb_version']}`. Generated by `eval/run.py`; do not edit by hand.",
        "",
        "## Headline",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| **Hard-rule violations** (target 0) | **{len(viol)}** |",
        f"| Sensitive tickets auto-drafted (gold needs a human or decline) | {len(unsafe)} |",
        f"| Routing accuracy (exact route) | {pct(route_hits, n)} |",
        f"| Over-escalations (gold auto_draft, sent to a human) | {len(over)} |",
        f"| Strict abstain (holding reply) precision / recall | {f(summary['abstain_precision'])} / "
        f"{f(summary['abstain_recall'])} (on {len(scored)} tickets with a clear label) |",
        f"| Uncovered questions where the model did not claim full coverage | {pct(hedged, len(uncovered))} |",
        f"| Citation validity (quotes found verbatim in the cited chunk) | {pct(valid, proposed)} |",
        f"| Latency p50 / p95 | {summary['latency_p50_ms'] / 1000:.1f} s / {summary['latency_p95_ms'] / 1000:.1f} s |",
        f"| Cost per ticket (mean / p95) | ${summary['cost_per_ticket_usd']:.5f} / ${summary['cost_p95_usd']:.5f} |",
        f"| Tokens per ticket (mean) | {summary['tokens_per_ticket']:.0f} |",
        "",
        "## Classification",
        "",
        "| Field | Accuracy |",
        "|---|---|",
        f"| category | {pct(*acc('category'))} |",
        f"| urgency (exact) | {pct(*acc('urgency'))} |",
        f"| urgency (within one level) | {pct(urg_near, n)} |",
        f"| language | {pct(*acc('language'))} |",
        f"| sentiment | {pct(*acc('sentiment'))} |",
        "",
        "## Routing (rows = gold, columns = predicted)",
        "",
        "| gold \\ predicted | " + " | ".join(ROUTES) + " |",
        "|---|" + "---|" * len(ROUTES),
    ]
    for gr in ROUTES:
        cells = [
            str(
                sum(
                    gi["route"] == gr and pi.decision.route == pr
                    for gi, pi in zip(g, p, strict=True)
                )
            )
            for pr in ROUTES
        ]
        L.append(f"| {gr} | " + " | ".join(cells) + " |")
    L += ["", "## Hard-rule violations", ""]
    L += [f"- `{tid}`: {v}" for tid, v in viol] or ["None."]
    L += [
        "",
        "## Route disagreements",
        "",
        "| id | gold | predicted | reasons |",
        "|---|---|---|---|",
    ]
    for gi, pi in zip(g, p, strict=True):
        if gi["route"] != pi.decision.route:
            L.append(
                f"| {gi['id']} | {gi['route']} | {pi.decision.route} | {', '.join(pi.decision.reasons)} |"
            )
    L += [
        "",
        "## Category disagreements",
        "",
        "| id | gold | predicted | ticket |",
        "|---|---|---|---|",
    ]
    for gi, pi in zip(g, p, strict=True):
        if gi["category"] != pi.classification.category:
            text = gi["text"][:70].replace("|", "/")
            L.append(f"| {gi['id']} | {gi['category']} | {pi.classification.category} | {text} |")
    L += ["", "## Abstain disagreements", ""]
    ab = [
        f"- `{gi['id']}` gold should_abstain={gi['should_abstain']}, predicted abstained="
        f"{pi.draft.abstained} {pi.draft.problems}"
        for gi, pi in scored
        if bool(gi["should_abstain"]) != pi.draft.abstained
    ]
    L += ab or ["None."]
    L.append("")
    return "\n".join(L), summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["openai", "fake"], default="openai")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--tickets", type=Path, default=EVAL_DIR / "tickets.jsonl")
    ap.add_argument("--out", type=Path, default=EVAL_DIR)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--fresh", action="store_true", help="ignore previous partial results")
    args = ap.parse_args()

    gold = load_gold(args.tickets)
    copilot = Copilot(make_provider(args.provider, args.model))
    from copilot.prompts import PROMPT_VERSION

    args.out.mkdir(parents=True, exist_ok=True)
    results_path = args.out / "results.jsonl"
    key = {"model": copilot.provider.model, "prompt": PROMPT_VERSION, "kb": copilot.kb_version}
    done: dict[str, dict[str, Any]] = {}
    if results_path.exists() and not args.fresh:
        for line in results_path.read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            if row.get("key") == key:
                done[row["gold"]["id"]] = row
    if args.fresh or not done:
        results_path.write_text("", encoding="utf-8")

    todo = [gi for gi in gold if gi["id"] not in done]
    print(f"{len(done)} already done, {len(todo)} to run with {key['model']}")
    lock = threading.Lock()

    def work(gi: dict[str, Any]) -> None:
        result = copilot.triage(Ticket(id=gi["id"], text=gi["text"]))
        row = {"key": key, "gold": gi, "result": result.model_dump(mode="json")}
        with lock, results_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            fh.flush()
        done[gi["id"]] = row
        print(f"  {gi['id']}: {result.decision.route} (gold {gi['route']})")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(work, todo))

    # Score with the current labels, even for results produced before a label was revised.
    rows = [{"gold": gi, "result": done[gi["id"]]["result"]} for gi in gold]
    meta = {
        "model": key["model"],
        "prompt_version": PROMPT_VERSION,
        "kb_version": copilot.kb_version,
        "date": date.today().isoformat(),
    }
    report, summary = build_report(rows, meta)
    (args.out / "report.md").write_text(report, encoding="utf-8")
    (args.out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(report.split("## Classification")[0])


if __name__ == "__main__":
    main()
