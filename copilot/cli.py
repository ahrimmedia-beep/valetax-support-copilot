"""Command line entry point.

copilot triage "My withdrawal is pending, what does it mean?"
copilot triage --file eval/tickets.jsonl
copilot triage --provider fake "..."     # offline, no API key needed
copilot triage --json "..."              # full TriageResult as JSON
copilot serve --provider fake            # agent console at http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
from pathlib import Path

from copilot.llm import DEFAULT_MODEL, FakeProvider, LLMError, LLMProvider, OpenAIProvider
from copilot.models import Ticket, TriageResult
from copilot.pipeline import Copilot
from copilot.voice import SpeechError


def make_provider(name: str, model: str) -> LLMProvider:
    if name == "fake":
        return FakeProvider()
    return OpenAIProvider(model=model)


def read_tickets(path: Path) -> list[Ticket]:
    tickets = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            row = json.loads(line)
            tickets.append(Ticket(id=str(row.get("id", n)), text=row["text"]))
    return tickets


def render(result: TriageResult, ticket: Ticket) -> str:
    c, d = result.classification, result.decision
    flags = {k: v for k, v in result.guardrails.model_dump().items() if v}
    lines = [
        "=" * 78,
        f"Ticket {ticket.id}: {textwrap.shorten(ticket.text, 70)}",
        f"Classification : category={c.category} urgency={c.urgency} "
        f"language={c.language} sentiment={c.sentiment}",
        f"Guardrails     : {flags or 'none'}",
        f"ROUTE          : {d.route}  ({', '.join(d.reasons)})",
        "Draft reply    :",
        textwrap.indent(textwrap.fill(result.draft.reply, 74), "   "),
    ]
    if result.draft.citations:
        lines.append("Citations      :")
        lines += [f'   - {x.page} [{x.heading}] "{x.quote}"' for x in result.draft.citations]
    if result.draft.problems:
        lines.append(f"Draft problems : {result.draft.problems}")
    u = result.usage
    lines.append(
        f"Cost/latency   : ${u.cost_usd:.5f}, {u.input_tokens}+{u.output_tokens} tokens, "
        f"{result.total_latency_ms:.0f} ms, model={result.model}"
    )
    return "\n".join(lines)


def run_server(host: str, port: int, provider: str | None) -> int:
    import uvicorn

    from copilot.web.app import create_app

    if provider:
        os.environ["COPILOT_PROVIDER"] = provider
    try:
        app = create_app()
    except (LLMError, SpeechError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    uvicorn.run(app, host=host, port=port)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="copilot", description="Support-ticket co-pilot")
    sub = parser.add_subparsers(dest="command", required=True)
    triage = sub.add_parser("triage", help="classify, draft and route tickets")
    triage.add_argument("text", nargs="?", help="ticket text")
    triage.add_argument("--file", type=Path, help="JSONL file with {id, text} per line")
    triage.add_argument("--provider", choices=["openai", "fake"], default="openai")
    triage.add_argument("--model", default=DEFAULT_MODEL)
    triage.add_argument("--json", action="store_true", help="print full results as JSON lines")
    serve = sub.add_parser("serve", help="run the agent console (web UI and API)")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument(
        "--provider", choices=["openai", "fake"], help="default: openai if a key is set, else fake"
    )
    args = parser.parse_args(argv)

    if args.command == "serve":
        return run_server(args.host, args.port, args.provider)

    if bool(args.text) == bool(args.file):
        parser.error("give either ticket text or --file")
    tickets = read_tickets(args.file) if args.file else [Ticket(text=args.text)]

    try:
        copilot = Copilot(make_provider(args.provider, args.model))
    except LLMError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    for ticket in tickets:
        result = copilot.triage(ticket)
        print(result.model_dump_json() if args.json else render(result, ticket))
    return 0


if __name__ == "__main__":
    sys.exit(main())
