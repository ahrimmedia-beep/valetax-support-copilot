"""Turn the saved Valetax help pages (kb/raw/*.html) into clean Markdown (kb/*.md).

The pages are kept as they are: no typo fixes, no deduplication, no "improvements".
Only page chrome (menus, footer, CTA blocks) is dropped. Everything the co-pilot is
allowed to say comes from these files, so the extraction must be reproducible:

    uv run python -m copilot.kb_extract

The extractor understands the two content blocks these pages use:
  * `seps-list__item`  -> numbered steps (label + h2 heading + optional paragraph)
  * `accordion__item`  -> FAQ (h4 question + accordion__text answer)
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path

SOURCES: dict[str, str] = {
    "how-to-deposit": "https://valetax.com/how-to-deposit/",
    "how-to-withdraw": "https://valetax.com/how-to-withdraw/",
    "how-to-open-an-account": "https://valetax.com/how-to-open-an-account/",
    "how-to-verify-account": "https://valetax.com/how-to-verify-account/",
}
FETCHED = "2026-10-13"


@dataclass
class ExtractedPage:
    title: str = ""
    intro: str = ""
    steps: list[str] = field(default_factory=list)
    faq_title: str = ""
    faq: list[tuple[str, str]] = field(default_factory=list)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


class _PageParser(HTMLParser):
    """Small state machine over the page's CSS classes. Not a general HTML parser."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.page = ExtractedPage()
        self._stack: list[str] = []  # class attribute of each open element
        self._buf: list[str] = []
        self._capture: str | None = None  # what the current text buffer belongs to
        self._step_parts: list[str] = []
        self._question = ""

    def _inside(self, css_class: str) -> bool:
        return any(css_class in c.split() for c in self._stack)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        css = dict(attrs).get("class") or ""
        if tag in {"img", "br", "meta", "link", "input", "source"}:
            return
        self._stack.append(css)
        if self._capture is not None:
            return
        if tag == "h1" and "page__title" in css:
            self._start("title")
        elif tag == "p" and self._inside("page__content-top") and not self.page.intro:
            self._start("intro")
        elif tag == "div" and "seps-list__item" in css.split():
            self._step_parts = []
        elif (
            tag in {"h2", "p"}
            and self._inside("seps-list__content-wrap")
            and not self._inside("seps-list__label")
        ):
            self._start("step_part")
        elif tag == "h2" and self._inside("accordion__title"):
            self._start("faq_title")
        elif tag == "h4" and self._inside("accordion__item"):
            self._start("question")
        elif tag == "p" and self._inside("accordion__text"):
            self._start("answer")

    def _start(self, what: str) -> None:
        self._capture = what
        self._buf = []
        self._depth = len(self._stack)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        """Self-closing tags (<img/>) carry no text; ignore them so the stack stays balanced."""

    def handle_data(self, data: str) -> None:
        if self._capture is not None:
            self._buf.append(data)

    def handle_endtag(self, tag: str) -> None:
        if not self._stack:
            return
        if self._capture is not None and len(self._stack) == self._depth:
            self._finish(_clean("".join(self._buf)))
            self._capture = None
        css = self._stack.pop()
        if tag == "div" and "seps-list__item" in css.split() and self._step_parts:
            self.page.steps.append(" - ".join(self._step_parts))

    def _finish(self, text: str) -> None:
        p = self.page
        if self._capture == "title":
            p.title = text
        elif self._capture == "intro":
            p.intro = text
        elif self._capture == "step_part":
            self._step_parts.append(text)
        elif self._capture == "faq_title":
            p.faq_title = text
        elif self._capture == "question":
            self._question = text
        elif self._capture == "answer":
            if p.faq and p.faq[-1][0] == self._question:  # multi-paragraph answer
                p.faq[-1] = (self._question, p.faq[-1][1] + " " + text)
            else:
                p.faq.append((self._question, text))


def _modified_date(raw: str) -> str:
    m = re.search(r'"dateModified":"([0-9-]{10})', raw)
    return m.group(1) if m else "unknown"


def extract(raw_html: str) -> ExtractedPage:
    main = re.search(r"<main.*?</main>", raw_html, re.S)
    parser = _PageParser()
    parser.feed(main.group(0) if main else raw_html)
    return parser.page


def to_markdown(slug: str, raw_html: str) -> str:
    page = extract(raw_html)
    meta = {"url": SOURCES[slug], "page_modified": _modified_date(raw_html), "fetched": FETCHED}
    lines = ["---", *(f"{k}: {v}" for k, v in meta.items()), "---", "", f"# {page.title}", ""]
    if page.intro:
        lines += [page.intro, ""]
    if page.steps:
        lines += ["## Steps", ""]
        lines += [f"{i}. {s}" for i, s in enumerate(page.steps, 1)]
        lines.append("")
    if page.faq:
        lines += [f"## FAQ: {page.faq_title}", ""]
        for q, a in page.faq:
            lines += [f"### {q}", "", a, ""]
    return "\n".join(lines)


def main() -> None:
    root = Path(__file__).resolve().parent.parent / "kb"
    summary = {}
    for slug in SOURCES:
        raw = (root / "raw" / f"{slug}.html").read_text(encoding="utf-8")
        md = to_markdown(slug, raw)
        (root / f"{slug}.md").write_text(md, encoding="utf-8")
        page = extract(raw)
        summary[slug] = {"steps": len(page.steps), "faq": len(page.faq)}
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
