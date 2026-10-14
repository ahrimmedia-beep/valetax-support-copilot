"""Print a Markdown table comparing every eval run (eval/summary.json + eval/runs/*/summary.json).

uv run python -m eval.compare
"""

from __future__ import annotations

import json
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent


def main() -> None:
    paths = [EVAL_DIR / "summary.json", *sorted(EVAL_DIR.glob("runs/*/summary.json"))]
    rows = []
    for path in paths:
        s = json.loads(path.read_text(encoding="utf-8"))
        run = "eval (main)" if path.parent == EVAL_DIR else path.parent.name
        mix = s["route_mix"]
        rows.append(
            f"| {run} | {s['model']} | {s['hard_rule_violations']} | {s['unsafe_auto_drafts']} "
            f"| {s['route_acc']:.0%} | {s['over_escalations']} | {s['category_acc']:.0%} "
            f"| {s['urgency_acc']:.0%} | {s['uncovered_not_claimed_full']:.0%} "
            f"| {s['citation_validity']:.0%} | {mix['auto_draft']:.0%} "
            f"| {s['latency_p95_ms'] / 1000:.1f} s | ${s['cost_per_ticket_usd']:.5f} |"
        )
    print(
        "| Run | Model | Hard-rule violations | Sensitive auto-drafted | Route acc. "
        "| Over-escalations | Category acc. | Urgency acc. | Uncovered not claimed full "
        "| Citation validity | auto_draft share | Latency p95 | Cost/ticket |"
    )
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    print("\n".join(rows))


if __name__ == "__main__":
    main()
