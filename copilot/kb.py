"""Load the knowledge base (kb/*.md) and split it into citable chunks.

One chunk = one thing a customer can ask about:
  * the page's step-by-step guide (title + intro + numbered steps) -> `<page>#steps`
  * each FAQ question with its answer                                -> `<page>#faq-<n>`

Every chunk keeps its page URL and heading, so a citation can always point back to the
public page an agent can open. Pages are taken as they are (see docs/kb-audit.md).
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from copilot.models import Chunk

DEFAULT_KB_DIR = Path(__file__).resolve().parent.parent / "kb"


def _front_matter(text: str) -> tuple[dict[str, str], str]:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}, text
    meta = dict(line.split(": ", 1) for line in m.group(1).splitlines() if ": " in line)
    return meta, text[m.end() :]


def chunk_page(slug: str, markdown: str) -> list[Chunk]:
    meta, body = _front_matter(markdown)
    url = meta.get("url", "")
    chunks: list[Chunk] = []

    title_m = re.search(r"^# (.+)$", body, re.M)
    title = title_m.group(1).strip() if title_m else slug
    faq_start = body.find("\n## FAQ")
    guide = body if faq_start == -1 else body[:faq_start]
    guide_text = re.sub(r"^#+ ", "", guide, flags=re.M).strip()
    if guide_text:
        chunks.append(
            Chunk(
                id=f"{slug}#steps", page=slug, url=url, heading=f"{title}: steps", text=guide_text
            )
        )

    if faq_start != -1:
        faq = body[faq_start:]
        parts = re.split(r"^### (.+)$", faq, flags=re.M)
        # parts = [preamble, q1, a1, q2, a2, ...]
        for n, (question, answer) in enumerate(zip(parts[1::2], parts[2::2], strict=True), 1):
            answer = answer.strip()
            if not answer:  # a heading without an answer is not citable
                continue
            chunks.append(
                Chunk(
                    id=f"{slug}#faq-{n}",
                    page=slug,
                    url=url,
                    heading=question.strip(),
                    text=f"{question.strip()}\n{answer}",
                )
            )
    return chunks


def load_kb(kb_dir: Path = DEFAULT_KB_DIR) -> list[Chunk]:
    chunks: list[Chunk] = []
    for path in sorted(kb_dir.glob("*.md")):
        chunks.extend(chunk_page(path.stem, path.read_text(encoding="utf-8")))
    return chunks


def kb_version(kb_dir: Path = DEFAULT_KB_DIR) -> str:
    """Content hash of the KB. Stored with every decision so an answer can be traced to the
    exact KB text it was drafted from."""
    h = hashlib.sha256()
    for path in sorted(kb_dir.glob("*.md")):
        h.update(path.name.encode())
        h.update(path.read_bytes())
    return h.hexdigest()[:12]
