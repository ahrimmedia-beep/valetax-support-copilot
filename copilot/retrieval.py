"""Phase 1 retrieval: plain BM25 over ~30 chunks, no vector database.

Why this is enough today: the KB is 4 pages / ~7 KB of text. BM25 is deterministic,
needs no index service, is explainable line by line, and runs in microseconds.
Tickets in other languages are handled upstream: the classifier rewrites each customer
question as a short English query (`Classification.kb_questions`), so BM25 only ever
matches English against English. Phase 2 swaps this module for embeddings + a reranker
behind the same `search()` signature (see docs/phase-2.md).
"""

from __future__ import annotations

import math
import re
from collections import Counter

import snowballstemmer  # type: ignore[import-untyped]

from copilot.models import Chunk, ScoredChunk

STOPWORDS = frozenset(
    """a an the and or but if of to in on at for from by with about into is are was were be been
    being do does did done have has had i me my we our you your it its this that these those
    can could will would should may might must what which who whom when where why how there
    their them they he she his her not no yes so than then too very just also any all some
    please hi hello thanks thank get got""".split()
)

_STEMMER = snowballstemmer.stemmer("english")

# A handful of support-domain equivalences applied after stemming. Kept tiny on purpose:
# every entry is a decision someone can read and argue with.
_SYNONYMS = {
    "verifi": "verif",  # verify / verification
    "money": "fund",
    "cash": "fund",
    "payout": "withdraw",
    "signup": "regist",
    "registr": "regist",
}


def tokenize(text: str) -> list[str]:
    tokens = [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOPWORDS]
    stems: list[str] = _STEMMER.stemWords(tokens)
    return [_SYNONYMS.get(t, t) for t in stems]


class BM25Index:
    def __init__(self, chunks: list[Chunk], k1: float = 1.5, b: float = 0.75) -> None:
        self.chunks = chunks
        self.k1, self.b = k1, b
        self.docs = [Counter(tokenize(f"{c.heading} {c.text}")) for c in chunks]
        self.lengths = [sum(d.values()) for d in self.docs]
        self.page_terms = [set(tokenize(c.page.replace("-", " "))) for c in chunks]
        self.avg_len = sum(self.lengths) / max(len(self.docs), 1)
        df: Counter[str] = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def score(self, query: str) -> list[float]:
        q_terms = tokenize(query)
        scores = []
        for doc, length in zip(self.docs, self.lengths, strict=True):
            s = 0.0
            for t in q_terms:
                tf = doc.get(t, 0)
                if tf:
                    norm = tf + self.k1 * (1 - self.b + self.b * length / self.avg_len)
                    s += self.idf[t] * tf * (self.k1 + 1) / norm
            scores.append(s)
        return scores

    def search(self, queries: list[str], top_k: int = 4, max_total: int = 6) -> list[ScoredChunk]:
        """Top `top_k` chunks per query, merged (best score wins), capped at `max_total`.

        The deposit and withdraw pages carry the same FAQ word for word. Identical texts are
        collapsed to one chunk so duplicates do not crowd out other evidence.
        """
        best: dict[int, float] = {}
        for q in queries:
            scores = self.score(q)
            q_terms = set(tokenize(q))
            # On equal scores (duplicated FAQ), prefer the page the query is about.
            ranked = sorted(
                range(len(scores)),
                key=lambda i: (scores[i], bool(self.page_terms[i] & q_terms)),
                reverse=True,
            )
            seen_texts: set[str] = set()
            kept = 0
            for i in ranked:
                if kept == top_k or scores[i] <= 0:
                    break
                if self.chunks[i].text in seen_texts:
                    continue
                seen_texts.add(self.chunks[i].text)
                best[i] = max(best.get(i, 0.0), scores[i])
                kept += 1
        order = sorted(best, key=lambda i: best[i], reverse=True)
        result: list[ScoredChunk] = []
        texts: set[str] = set()
        for i in order:
            if self.chunks[i].text in texts:
                continue
            texts.add(self.chunks[i].text)
            result.append(ScoredChunk(chunk=self.chunks[i], score=round(best[i], 3)))
        return result[:max_total]
