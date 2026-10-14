"""Data contracts of the pipeline. Everything that crosses a step boundary is one of these."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal[
    "deposit",
    "withdrawal",
    "account_opening",
    "verification",
    "trading_advice",
    "complaint",
    "other",
]
Urgency = Literal["low", "normal", "high", "critical"]
Sentiment = Literal["negative", "neutral", "positive"]
Route = Literal["auto_draft", "human_review", "decline_trading_advice"]
SensitiveTopic = Literal["complaint", "kyc_aml", "account_blocked", "legal_threat", "fraud"]

URGENCY_ORDER: dict[Urgency, int] = {"low": 0, "normal": 1, "high": 2, "critical": 3}


class Ticket(BaseModel):
    id: str = "adhoc"
    text: str


class GuardrailFlags(BaseModel):
    """Output of the deterministic (no-LLM) checks. Each list holds the matched snippets."""

    trading_advice: list[str] = Field(default_factory=list)
    complaint: list[str] = Field(default_factory=list)
    kyc_aml: list[str] = Field(default_factory=list)
    account_blocked: list[str] = Field(default_factory=list)
    legal_threat: list[str] = Field(default_factory=list)
    fraud: list[str] = Field(default_factory=list)
    money_issue: list[str] = Field(default_factory=list)
    prompt_injection: list[str] = Field(default_factory=list)
    pii_types: list[str] = Field(default_factory=list)


class Classification(BaseModel):
    """What the LLM returns for step 2 (also the schema sent to the model)."""

    category: Category
    urgency: Urgency
    language: str = Field(description="ISO 639-1 code of the customer's language, e.g. en, ru, ar")
    sentiment: Sentiment
    sensitive_topics: list[SensitiveTopic] = Field(
        description="Every sensitive topic present in the ticket; empty list if none"
    )
    kb_questions: list[str] = Field(
        description=(
            "The customer's support questions rewritten as short English search queries, one per "
            "question. Exclude requests for trading advice. Empty list if there is no question."
        )
    )


class Chunk(BaseModel):
    id: str  # e.g. "how-to-deposit#faq-4"
    page: str  # page slug
    url: str
    heading: str
    text: str


class ScoredChunk(BaseModel):
    chunk: Chunk
    score: float


class LLMCitation(BaseModel):
    chunk_id: str
    quote: str = Field(description="Exact sentence copied character-for-character from the source")


class LLMDraft(BaseModel):
    """What the LLM returns for step 4 (also the schema sent to the model)."""

    covered: Literal["full", "partial", "none"] = Field(
        description="Do the sources answer the customer's questions: full, partial or none"
    )
    reply: str = Field(description="Reply to the customer in their language; empty if covered=none")
    citations: list[LLMCitation]


class Citation(BaseModel):
    chunk_id: str
    page: str
    heading: str
    quote: str


SentenceKind = Literal["fact", "greeting", "closing", "handoff"]


class DraftSentence(BaseModel):
    """One sentence of an accepted draft and the citations that back it (for the agent UI)."""

    text: str
    kind: SentenceKind
    chunk_ids: list[str] = Field(default_factory=list)


class Draft(BaseModel):
    reply: str
    citations: list[Citation] = Field(default_factory=list)
    sentences: list[DraftSentence] = Field(default_factory=list)
    abstained: bool = False
    coverage: Literal["full", "partial", "none", "not_applicable"] = "not_applicable"
    problems: list[str] = Field(default_factory=list)  # why a draft was rejected, if it was
    unanswered_terms: list[str] = Field(default_factory=list)  # named in ticket, absent in KB
    citations_proposed: int = 0  # by the LLM, before verification
    citations_valid: int = 0  # passed the substring check


class Decision(BaseModel):
    route: Route
    reasons: list[str] = Field(default_factory=list)


class Usage(BaseModel):
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    llm_latency_ms: float = 0.0

    def add(self, other: Usage) -> None:
        self.calls += other.calls
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cost_usd += other.cost_usd
        self.llm_latency_ms += other.llm_latency_ms


class TraceStep(BaseModel):
    """One pipeline step as the agent UI shows it: what ran, how long, what it found."""

    step: Literal["guardrails", "redaction", "classify", "retrieve", "draft", "verify", "route"]
    ms: float
    detail: str


class TriageResult(BaseModel):
    """Everything an agent (and an auditor) needs to see for one ticket."""

    ticket_id: str
    input_sha256: str
    guardrails: GuardrailFlags
    classification: Classification
    retrieved: list[ScoredChunk]
    draft: Draft
    decision: Decision
    usage: Usage
    total_latency_ms: float
    model: str
    prompt_version: str
    kb_version: str
    errors: list[str] = Field(default_factory=list)
    trace: list[TraceStep] = Field(default_factory=list)
