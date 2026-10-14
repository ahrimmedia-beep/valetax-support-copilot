from __future__ import annotations

import pytest

from copilot.kb import load_kb
from copilot.models import Chunk
from copilot.retrieval import BM25Index


@pytest.fixture(scope="session")
def chunks() -> list[Chunk]:
    return load_kb()


@pytest.fixture(scope="session")
def index(chunks: list[Chunk]) -> BM25Index:
    return BM25Index(chunks)
