// Operator console: one ticket at a time, every step of the pipeline visible,
// every fact in the reply traceable to the help-centre sentence it came from.

const RTL_LANGS = new Set(["ar", "ckb", "fa", "ur", "he"]);
const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHARS = /[A-Za-zЀ-ӿऀ-ॿ]/;
const STEPS = ["guardrails", "redaction", "classify", "retrieve", "draft", "verify", "route"];
const STEP_NAMES = {
  guardrails: "Guardrails", redaction: "Redaction", classify: "Classify", retrieve: "Retrieve",
  draft: "Draft", verify: "Verify", route: "Route",
};
const GROUPS = { core: "Core eval set", real_themes: "Real-world themes" };

// Guardrail flags. Red is kept for the hard rules only.
const FLAGS = {
  trading_advice: ["Trading advice", "blue"],
  prompt_injection: ["Prompt injection", "red"],
  fraud: ["Fraud", "red"],
  legal_threat: ["Legal threat", "red"],
  account_blocked: ["Account blocked", "amber"],
  kyc_aml: ["KYC / AML", "amber"],
  complaint: ["Complaint", "amber"],
  money_issue: ["Money issue", "amber"],
};

const ROUTES = {
  auto_draft: {
    cls: "r-auto", title: "Auto-draft",
    verdict: "Grounded and checked. Safe to send after a quick read.",
  },
  human_review: {
    cls: "r-review", title: "Human review",
    verdict: "An agent must read, decide and edit before anything is sent.",
  },
  decline_trading_advice: {
    cls: "r-decline", title: "Decline: trading advice",
    verdict: "Fixed, compliance-approved decline. No advice is given.",
  },
};

// Routing and draft codes -> [severity, plain-English reason].
const SEV_LABEL = { risk: "Risk", review: "Review", draft: "Draft", policy: "Policy", ok: "Passed", error: "Error" };
const SEV_CLASS = { risk: "sev-block", review: "sev-review", draft: "sev-review", policy: "sev-info", ok: "sev-ok", error: "sev-block" };
const REASONS = {
  grounded_answer_all_checks_passed: ["ok", "Every fact is quoted from the help centre and all checks passed"],
  trading_advice: ["policy", "Asks for trading or investment advice, which the broker cannot give"],
  complaint: ["review", "Complaint about the service or a transaction"],
  kyc_aml: ["review", "Verification or compliance (KYC / AML) matter"],
  account_blocked: ["review", "Account is blocked or restricted"],
  legal_threat: ["risk", "Threatens legal action or a chargeback"],
  fraud: ["risk", "Possible fraud or an unauthorised payment"],
  money_issue: ["review", "Customer money is missing, delayed or rejected"],
  prompt_injection: ["risk", "Message tries to override the co-pilot's rules"],
  urgency_high: ["review", "High urgency"],
  urgency_critical: ["risk", "Critical urgency"],
  negative_sentiment_money: ["review", "Upset customer writing about a deposit or withdrawal"],
  abstained: ["draft", "Reply held back: nothing grounded to send"],
  partially_covered: ["draft", "Help centre answers only part of the question"],
  specific_term_not_in_kb: ["draft", "Mentions something the help centre does not cover"],
  pipeline_error: ["error", "A pipeline step failed, so the ticket falls back to a person"],
  kb_not_covered: ["draft", "Help centre does not cover this question"],
  low_retrieval_score: ["draft", "No help-centre article matched closely enough"],
  no_support_question: ["draft", "No support question found to answer"],
  citation_check_failed: ["draft", "A quote did not match its source word for word"],
  llm_error: ["error", "The model call failed"],
  uncited_fact: ["draft", "A factual sentence had no citation"],
  bad_cite: ["draft", "A sentence pointed to a citation that does not exist"],
  ungrounded_number: ["draft", "A number in the reply is not in the sources"],
  ungrounded_term: ["draft", "A term in the reply is not in the sources"],
  sentence_number_not_in_its_source: ["draft", "A sentence uses a number its own source does not contain"],
  sentence_term_not_in_its_source: ["draft", "A sentence uses a term its own source does not contain"],
  unsafe_reply: ["risk", "Reply text tripped a safety rule"],
};

function reasonInfo(code) {
  if (REASONS[code]) return REASONS[code];
  if (code.startsWith("fact_disguised_as_")) {
    return ["draft", "A courtesy sentence states a fact without a citation"];
  }
  const words = code.replace(/_/g, " ");
  return ["review", words.charAt(0).toUpperCase() + words.slice(1)];
}

const state = {
  health: null,
  samples: [],
  kb: { version: "", pages: [] },
  chunks: new Map(),
  stats: null,
  current: null, // { result, meta, original, cites, sent }
  handled: new Map(),
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wide = window.matchMedia("(min-width: 900px)");
const motion = () => Boolean(window.gsap) && !reduceMotion.matches;
const $ = (sel, root = document) => root.querySelector(sel);

// ---------- DOM helpers ----------

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function fmtMs(ms) {
  if (ms >= 1000) return [(ms / 1000).toFixed(2), "s"];
  if (ms >= 100) return [Math.round(ms).toString(), "ms"];
  if (ms >= 10) return [ms.toFixed(1), "ms"];
  return [ms.toFixed(2), "ms"];
}

function isRtl(lang, text) {
  if (RTL_LANGS.has((lang || "").toLowerCase())) return true;
  const first = (text || "").match(new RegExp(`${RTL_CHARS.source}|${LTR_CHARS.source}`));
  return Boolean(first && RTL_CHARS.test(first[0]));
}
const dirFor = (lang, text) => (isRtl(lang, text) ? "rtl" : "auto");
const firstLine = (t) => t.split(/\n/).find((l) => l.trim()) || t;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// A public demo server may require a token (DEMO_TOKEN). The link carries it as ?token=...;
// it is kept for this tab only and removed from the address bar.
const DEMO_TOKEN = (() => {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("token") || "";
  let token = fromUrl;
  try {
    if (fromUrl) sessionStorage.setItem("demoToken", fromUrl);
    else token = sessionStorage.getItem("demoToken") || "";
  } catch { /* storage blocked: use the URL value for this page load */ }
  if (fromUrl) {
    params.delete("token");
    const query = params.toString();
    try { history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`); } catch { /* ignore */ }
  }
  return token;
})();

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (DEMO_TOKEN) headers.set("X-Demo-Token", DEMO_TOKEN);
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d.msg).join("; ");
    } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res;
}
const getJson = async (path) => (await api(path)).json();
const postJson = async (path, body) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---------- Top bar ----------

function renderStatus() {
  const box = $("#status");
  box.replaceChildren();
  const hc = state.health;
  if (!hc) {
    box.append(h("span", { class: "pill off" }, h("span", { class: "dot" }), "API unreachable"));
    return;
  }
  const live = hc.provider === "openai";
  box.append(
    h("span", { class: `pill ${live ? "" : "off"}`, title: `LLM provider: ${hc.provider}` },
      h("span", { class: "dot" }), live ? "Live" : "Fake provider",
      hc.model !== hc.provider ? h("b", {}, hc.model) : null),
    h("span", { class: "pill" }, "KB", h("b", {}, hc.kb_version.slice(0, 8))),
    h("span", { class: "pill" }, "Prompt", h("b", {}, hc.prompt_version)),
    h("span", { class: "pill" }, "Speech", h("b", {}, hc.speech)),
  );
}

// ---------- Inbox ----------

function renderInbox() {
  const nav = $("#inbox");
  const q = $("#filter").value.trim().toLowerCase();
  const rows = state.samples.filter(
    (s) => !q || `${s.id} ${s.text} ${s.label} ${s.language}`.toLowerCase().includes(q),
  );
  nav.replaceChildren();
  $("#inbox-count").textContent = q ? `${rows.length} of ${state.samples.length}` : String(state.samples.length);
  if (!rows.length) {
    nav.append(h("p", { class: "muted pad" }, state.samples.length ? "No tickets match." : "No sample tickets found."));
    return;
  }
  for (const group of Object.keys(GROUPS)) {
    const items = rows.filter((s) => s.group === group);
    if (!items.length) continue;
    const list = h("div", { role: "list" });
    for (const s of items) list.append(h("div", { role: "listitem" }, inboxRow(s)));
    nav.append(
      h("div", { class: "group" },
        h("h3", { class: "group-head" }, h("span", {}, GROUPS[group]), h("span", {}, String(items.length))),
        list),
    );
  }
}

function inboxRow(s) {
  const current = state.current?.meta?.sampleId === s.id;
  const done = state.handled.get(s.id);
  return h("button", {
    type: "button", class: "tk", "data-id": s.id, "aria-current": current ? "true" : "false",
    onclick: () => openSample(s),
  },
    h("span", { class: "lang", title: `Language: ${s.language}` }, s.language || "—"),
    h("span", { class: "tk-text", dir: dirFor(s.language, s.text) }, firstLine(s.text)),
    h("span", { class: "tk-meta" },
      h("span", { class: "id" }, s.id),
      h("span", { class: "gold", title: `Expected: ${s.label}` }, goldShort(s.label)),
      done ? h("span", { class: "gold", style: "color:var(--green-ink)" }, `· ${done}`) : null),
  );
}

const GOLD_ROUTE = { auto_draft: "auto", human_review: "review", decline_trading_advice: "decline" };
function goldShort(label) {
  const [route, cat = ""] = label.split(" · ");
  const r = GOLD_ROUTE[route] || route;
  return h("span", { class: `gold-route g-${r}` }, r, h("span", { class: "gold-cat" }, ` · ${cat.replace(/_/g, " ")}`));
}

function markCurrentRow() {
  for (const b of document.querySelectorAll(".tk")) {
    const on = b.dataset.id === state.current?.meta?.sampleId;
    b.setAttribute("aria-current", on ? "true" : "false");
    if (on && wide.matches) {
      const list = $("#inbox");
      const lr = list.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      if (br.top < lr.top + 30 || br.bottom > lr.bottom) list.scrollTop += br.top - lr.top - lr.height / 3;
    }
  }
}

function openSample(s) {
  runTriage(s.text, s.id, { sampleId: s.id, source: GROUPS[s.group] || "Sample", language: s.language, gold: s.label, ticketText: s.text });
}

// ---------- Triage ----------

let runSeq = 0;

async function runTriage(text, id, meta) {
  const seq = ++runSeq;
  state.current = { meta, result: null };
  markCurrentRow();
  showLoading(text, meta, "Running the pipeline…");
  try {
    const res = await postJson("/api/triage", id ? { text, id } : { text });
    const result = await res.json();
    if (seq !== runSeq) return;
    showResult(result, meta);
  } catch (err) {
    if (seq !== runSeq) return;
    showError("The co-pilot could not process this ticket.", err.message);
  }
}

function setBusy(busy) {
  $("#workspace").setAttribute("aria-busy", busy ? "true" : "false");
  $("#run").disabled = busy;
}

function showLoading(text, meta, label) {
  setBusy(true);
  $("#empty").hidden = true;
  const box = $("#result");
  box.hidden = false;
  const rail = h("ol", { class: "rail" }, h("span", { class: "rail-track", "aria-hidden": "true" }),
    STEPS.map((s, i) => h("li", { class: "step st-skip" },
      h("span", { class: "node" }, String(i + 1)), h("span", { class: "step-name" }, STEP_NAMES[s]))));
  box.replaceChildren(h("div", { class: "result loading" },
    text ? ticketCard(text, meta, null) : null,
    h("section", { class: "card trace" },
      h("div", { class: "card-head", style: "padding:0" },
        h("h2", { class: "card-title" }, "Pipeline"), h("span", { class: "card-sub" }, label)),
      rail),
    h("section", { class: "card card-body" },
      h("div", { class: "skeleton", style: "width:60%" }), h("div", { class: "skeleton", style: "width:85%;margin-top:10px" }),
      h("div", { class: "skeleton", style: "width:40%;margin-top:10px" })),
  ));
}

function showError(title, detail) {
  setBusy(false);
  $("#empty").hidden = true;
  const box = $("#result");
  box.hidden = false;
  box.replaceChildren(h("div", { class: "result" },
    h("section", { class: "card error-card", role: "alert" }, h("strong", {}, title), detail)));
}

function showResult(r, meta, transcript = null) {
  setBusy(false);
  const cites = citationIndex(r.draft);
  state.current = { result: r, meta, cites, original: r.draft.reply, sent: false, transcript };
  markCurrentRow();
  const box = $("#result");
  box.hidden = false;
  $("#empty").hidden = true;
  const wrap = h("div", { class: "result" },
    ticketCard(meta.ticketText || "", meta, r, transcript),
    traceCard(r),
    routeCard(r),
    replyCard(r, meta),
    auditBlock(r),
  );
  box.replaceChildren(wrap);
  renderSources(r);
  animateIn(wrap);
  if (!wide.matches) $("#workspace").scrollIntoView({ block: "start", behavior: motion() ? "smooth" : "auto" });
}

// Ticket text with the guardrail matches highlighted in place.
function ticketCard(text, meta, r, transcript = null) {
  const lang = meta.language || r?.classification.language || "";
  const metaRow = h("div", { class: "ticket-meta" },
    h("span", { class: "lang", title: "Language" }, lang || "—"),
    h("span", { class: "mono" }, r?.ticket_id || meta.sampleId || "new ticket"),
    h("span", { class: "sep", "aria-hidden": "true" }, "|"),
    h("span", {}, meta.source || "Pasted"),
  );
  if (meta.gold && r) {
    const goldRoute = meta.gold.split(" · ")[0];
    const ok = goldRoute === r.decision.route;
    metaRow.append(h("span", { class: "sep", "aria-hidden": "true" }, "|"),
      h("span", { class: `expect ${ok ? "is-match" : "is-miss"}` },
        h("span", { class: "tick", "aria-hidden": "true" }, ok ? "✓" : "≠"),
        ok ? `Matches expected route (${goldRoute})` : `Expected ${goldRoute}, got ${r.decision.route}`));
  }
  const body = h("p", { class: "ticket-text", dir: dirFor(lang, text), lang: lang || null });
  body.append(...highlightFlags(text, r?.guardrails));
  return h("section", { class: "card card-body", "aria-label": "Ticket" },
    transcript ? h("div", { class: "transcript" },
      h("b", {}, "Voice transcript"),
      transcript.language ? h("span", {}, `language ${transcript.language}`) : null,
      transcript.duration_ms ? h("span", {}, `${(transcript.duration_ms / 1000).toFixed(1)} s audio`) : null,
      h("span", {}, transcript.model),
      h("span", {}, !transcript.duration_ms && !transcript.cost_usd
        ? "cost not reported"
        : `$${Number(transcript.cost_usd || 0).toFixed(4)}`)) : null,
    metaRow, body, r ? chipsRow(r) : null);
}

function highlightFlags(text, flags) {
  if (!flags) return [text];
  const ranges = [];
  const lower = text.toLowerCase();
  for (const [key, [label, tone]] of Object.entries(FLAGS)) {
    for (const snip of flags[key] || []) {
      let from = 0;
      const needle = snip.toLowerCase();
      if (!needle) continue;
      let at;
      while ((at = lower.indexOf(needle, from)) !== -1) {
        ranges.push({ start: at, end: at + needle.length, tone, label });
        from = at + needle.length;
      }
    }
  }
  if (!ranges.length) return [text];
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const rg of ranges) {
    const last = merged[merged.length - 1];
    if (last && rg.start < last.end) {
      last.end = Math.max(last.end, rg.end);
      if (rg.tone === "red") last.tone = "red";
      if (!last.label.includes(rg.label)) last.label += `, ${rg.label}`;
    } else merged.push({ ...rg });
  }
  const out = [];
  let pos = 0;
  for (const rg of merged) {
    if (rg.start > pos) out.push(text.slice(pos, rg.start));
    out.push(h("mark", { class: `hit hit-${rg.tone}`, title: `Guardrail: ${rg.label}` },
      text.slice(rg.start, rg.end), h("span", { class: "sr-only" }, ` (flagged: ${rg.label})`)));
    pos = rg.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function chipsRow(r) {
  const c = r.classification;
  const chip = (k, v, cls = "") => h("span", { class: `chip ${cls}` }, h("b", {}, k), v);
  const row = h("div", { class: "chips", "aria-label": "Classification and flags" },
    chip("Category", c.category.replace(/_/g, " ")),
    chip("Urgency", c.urgency, c.urgency === "critical" ? "chip-red" : c.urgency === "high" ? "chip-amber" : ""),
    chip("Language", c.language),
    chip("Sentiment", c.sentiment, c.sentiment === "negative" ? "chip-amber" : ""),
  );
  const g = r.guardrails;
  const seen = new Set();
  for (const [key, [label, tone]] of Object.entries(FLAGS)) {
    const hit = (g[key] || []).length || c.sensitive_topics.includes(key);
    if (!hit || seen.has(key)) continue;
    seen.add(key);
    const by = (g[key] || []).length ? "rule" : "model";
    row.append(h("span", {
      class: `chip chip-flag chip-${tone}`,
      title: (g[key] || []).length ? `Matched: ${g[key].join(" | ")}` : "Raised by the classifier",
    }, label, h("b", {}, by)));
  }
  if (g.pii_types.length) {
    row.append(h("span", { class: "chip", title: "Redacted before the model saw the text" },
      h("b", {}, "PII redacted"), g.pii_types.join(", ")));
  }
  return row;
}

// ---------- Pipeline trace ----------

function stepTone(t, r) {
  const d = t.detail || "";
  if (d.startsWith("skipped")) return ["skip", "Skipped"];
  if (d.startsWith("failed")) return ["fail", "Failed"];
  if (d.startsWith("abstained")) return ["warn", "Held"];
  if (t.step === "guardrails" && !d.startsWith("no flags")) {
    const tones = Object.entries(FLAGS).filter(([k]) => (r.guardrails[k] || []).length).map(([, v]) => v[1]);
    if (tones.includes("red")) return ["fail", "Flagged"];
    if (tones.includes("amber")) return ["warn", "Flagged"];
    return ["info", "Flagged"];
  }
  if (t.step === "redaction" && d.startsWith("redacted")) return ["info", "Redacted"];
  if (t.step === "verify") return ["ok", "Passed"];
  if (t.step === "route") {
    const rt = r.decision.route;
    return rt === "auto_draft" ? ["ok", "Auto"] : rt === "human_review" ? ["warn", "Review"] : ["info", "Decline"];
  }
  return ["ok", "Done"];
}

function traceCard(r) {
  const byStep = new Map(r.trace.map((t) => [t.step, t]));
  const steps = STEPS.map((s) => byStep.get(s) || { step: s, ms: 0, detail: "not run" });
  const total = steps.reduce((a, t) => a + t.ms, 0);
  const rail = h("ol", { class: "rail", "aria-label": "Pipeline steps" },
    h("span", { class: "rail-track", "aria-hidden": "true" }),
    h("span", { class: "rail-fill", "aria-hidden": "true" }),
    steps.map((t, i) => {
      const [tone, label] = stepTone(t, r);
      const [n, unit] = fmtMs(t.ms);
      return h("li", { class: `step st-${tone}`, title: t.detail },
        h("span", { class: "node", "aria-hidden": "true" }, String(i + 1)),
        h("span", { class: "step-name" }, STEP_NAMES[t.step]),
        h("span", { class: "step-ms" }, n, h("small", {}, ` ${unit}`)),
        h("span", { class: "step-state" }, label),
        h("span", { class: "step-detail" }, t.detail.replace(/([=,_#:])/g, "$1\u200b")));
    }));
  const slowest = steps.reduce((a, t) => (t.ms > a.ms ? t : a), steps[0]);
  const bar = h("div", { class: "budget-bar", role: "img",
    "aria-label": `Time per step. Slowest: ${STEP_NAMES[slowest.step]}` },
  steps.map((t) => h("span", {
    class: t === slowest && t.ms > 0 ? "is-big" : "",
    style: `flex-grow:${Math.max(t.ms, total * 0.012 || 1)}`,
    title: `${STEP_NAMES[t.step]}: ${fmtMs(t.ms).join(" ")}`,
  })));
  const [tn, tu] = fmtMs(r.total_latency_ms);
  const [ln, lu] = fmtMs(r.usage.llm_latency_ms);
  return h("section", { class: "card trace", "aria-label": "Pipeline trace" },
    h("div", { class: "card-head", style: "padding:0" },
      h("h2", { class: "card-title" }, "Pipeline"),
      h("span", { class: "card-sub" }, `${steps.filter((t) => !t.detail.startsWith("skipped")).length} of 7 steps ran`)),
    rail,
    h("div", { class: "budget" }, bar,
      h("div", { class: "budget-legend" },
        h("span", {}, "Slowest ", h("b", {}, STEP_NAMES[slowest.step]), ` ${fmtMs(slowest.ms).join(" ")}`),
        h("span", {}, "Model time ", h("b", {}, `${ln} ${lu}`), " · Total ", h("b", {}, `${tn} ${tu}`)))));
}

// ---------- Route ----------

// A decline followed by an answer that passed the draft checks (not a holding reply).
const declinePlusAnswer = (r) =>
  r.decision.route === "decline_trading_advice" && !r.draft.abstained && r.draft.sentences.length > 0;

function routeCard(r) {
  const route = ROUTES[r.decision.route] || { cls: "r-review", title: r.decision.route, verdict: "" };
  const verdict = declinePlusAnswer(r)
    ? "Fixed decline + checked answer. No advice is given; the answer covers only the support question."
    : route.verdict;
  const list = h("ul", { class: "reasons", "aria-label": "Why" });
  for (const code of r.decision.reasons) {
    const [sev, text] = reasonInfo(code);
    let extra = null;
    if (code === "specific_term_not_in_kb" && r.draft.unanswered_terms.length) {
      extra = h("small", {}, ` (${r.draft.unanswered_terms.join(", ")})`);
    }
    list.append(h("li", { class: "reason" },
      h("span", { class: `sev ${SEV_CLASS[sev]}` }, SEV_LABEL[sev]),
      h("span", {}, text, extra, h("span", { class: "reason-code" }, code))));
  }
  if (r.errors.length) {
    list.append(h("li", { class: "reason" }, h("span", { class: "sev sev-block" }, "Error"),
      h("span", { class: "errors" }, r.errors.join("; "))));
  }
  return h("section", { class: `card route ${route.cls}`, "aria-label": "Routing decision" },
    h("div", { class: "route-side" },
      h("span", { class: "eyebrow" }, "Route", h("span", { class: "route-code" }, r.decision.route)),
      h("span", { class: "route-badge" }, route.title),
      h("p", { class: "route-verdict", style: "margin:0" }, verdict)),
    list);
}

// ---------- Reply ----------

function citationIndex(draft) {
  const byChunk = new Map(); // chunk_id -> { n, quotes[] }
  let n = 0;
  for (const c of draft.citations) {
    if (!byChunk.has(c.chunk_id)) byChunk.set(c.chunk_id, { n: ++n, quotes: [] });
    byChunk.get(c.chunk_id).quotes.push(c.quote);
  }
  return byChunk;
}

function replyCard(r, meta) {
  const d = r.draft;
  const lang = r.classification.language || meta.language;
  // The reply's own script decides its direction (a holding reply may be English for an Arabic ticket).
  const dir = dirFor("", d.reply);
  const route = r.decision.route;
  const cites = state.current.cites;
  const parts = [];

  // The pipeline prepends the fixed decline to the reply; it is not part of draft.sentences.
  const trading = r.decision.reasons.includes("trading_advice");
  if (trading) {
    const declineText = d.reply.split("\n\n")[0];
    const rest = d.reply.length > declineText.length;
    parts.push(h("div", { class: "banner banner-blue decline", role: "note" },
      h("strong", {}, "Fixed decline (compliance template)"),
      h("span", {}, rest
        ? "Sent first. Not generated, nothing to cite. The answer to the rest of the ticket follows below."
        : "Not generated, nothing to cite. No trading advice is given."),
      h("p", { class: "decline-text", dir: dirFor("", declineText) }, declineText)));
  }

  if (d.abstained) {
    const problems = d.problems.map((p) => {
      const [code, ...rest] = p.split(":");
      const detail = rest.join(":").trim();
      return h("li", {}, reasonInfo(code)[1], detail ? h("span", { class: "mono" }, ` ${detail}`) : null);
    });
    parts.push(h("div", { class: "banner banner-amber", role: "note" },
      h("strong", {}, "Holding reply: draft not used"),
      h("span", {}, "The customer gets a neutral holding message. An agent writes the real answer."),
      problems.length ? h("ul", {}, problems) : null));
  } else if (d.problems.length) {
    parts.push(h("div", { class: "banner banner-amber", role: "note" },
      h("strong", {}, "Draft checks raised problems"),
      h("ul", {}, d.problems.map((p) => {
        const [code, ...rest] = p.split(":");
        return h("li", {}, reasonInfo(code)[1], rest.length ? h("span", { class: "mono" }, ` ${rest.join(":").trim()}`) : null);
      }))));
  }

  if (d.sentences.length) {
    const facts = d.sentences.filter((s) => s.kind === "fact").length;
    const para = h("p", { class: "sentences", dir, id: "sentences" });
    d.sentences.forEach((s, i) => {
      if (i) para.append(" ");
      const nums = [...new Set(s.chunk_ids.map((id) => cites.get(id)?.n).filter(Boolean))];
      const isFact = s.kind === "fact";
      const label = isFact
        ? `Fact, cited from ${nums.map((x) => `source ${x}`).join(", ") || "no source"}`
        : `${s.kind} sentence, states no facts`;
      para.append(h("span", {
        class: `sent ${isFact ? "sent-fact" : "sent-courtesy"}`,
        "data-chunks": s.chunk_ids.join(" "),
        tabindex: isFact ? "0" : null,
        role: isFact ? "button" : null,
        "aria-label": isFact ? `${s.text}. ${label}` : null,
        title: isFact ? null : label,
      }, s.text, nums.map((x) => h("span", { class: "cite", "aria-hidden": "true" }, String(x)))));
    });
    parts.push(h("div", { class: "evidence" },
      h("div", { class: "evidence-head" },
        h("span", { class: "eyebrow" }, "Evidence"),
        h("span", { class: "card-sub", style: "margin:0" },
          `${facts} fact${facts === 1 ? "" : "s"} · ${d.citations_valid}/${d.citations_proposed} quotes verified · coverage ${d.coverage}`),
        h("span", { class: "legend", "aria-hidden": "true" },
          h("span", {}, h("i"), "Cited fact"), h("span", {}, h("i", { class: "c" }), "Courtesy"))),
      para,
      h("p", { class: "stale-note", id: "stale-note", hidden: true },
        "Reply edited. The evidence above refers to the original draft.")));
  }

  const ta = h("textarea", {
    id: "reply", dir, lang: lang || null, spellcheck: "true", "aria-describedby": "reply-count",
  });
  ta.value = d.reply;
  const count = h("span", { id: "reply-count" }, `${d.reply.length} chars`);
  ta.addEventListener("input", onReplyInput);
  parts.push(h("div", { class: "editor" },
    h("label", { class: "editor-label", for: "reply" }, "Reply to customer", count), ta));

  const primaryEdit = route === "human_review";
  const sendBtn = h("button", { type: "button", class: `btn ${primaryEdit ? "" : "btn-primary"}`, id: "act-send",
    onclick: () => sendFeedback("sent_as_is") }, "Send as is");
  const editBtn = h("button", { type: "button", class: `btn ${primaryEdit ? "btn-primary" : ""}`, id: "act-edit",
    onclick: onEditSend }, "Edit & send");
  parts.push(h("div", { class: "actions" },
    sendBtn, editBtn,
    h("button", { type: "button", class: "btn btn-danger", id: "act-reject", onclick: () => sendFeedback("rejected") }, "Reject"),
    h("span", { class: "spacer" }),
    h("button", { type: "button", class: "btn btn-ghost", id: "act-listen", onclick: onListen }, "Listen"),
    h("p", { class: "action-msg", id: "action-msg", role: "status", "aria-live": "polite" })));

  const card = h("section", { class: "card reply", "aria-label": "Draft reply" },
    h("div", { class: "card-head" }, h("h2", { class: "card-title" }, "Draft reply"),
      h("span", { class: "card-sub" }, primaryEdit ? "Edit before sending"
        : route === "auto_draft" ? "Ready after a read"
          : declinePlusAnswer(r) ? "Fixed decline + checked answer" : "Approved template")),
    parts);
  wireSentences(card);
  return card;
}

function onReplyInput() {
  const ta = $("#reply");
  const edited = ta.value !== state.current.original;
  ta.classList.toggle("is-edited", edited);
  $("#reply-count").textContent = `${ta.value.length} chars${edited ? " · edited" : ""}`;
  $("#sentences")?.classList.toggle("is-stale", edited);
  const note = $("#stale-note");
  if (note) note.hidden = !edited;
  if (!state.current.sent) $("#act-send").disabled = edited;
}

function onEditSend() {
  const ta = $("#reply");
  if (ta.value === state.current.original) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    say("Edit the reply, then press Edit & send again.");
    return;
  }
  sendFeedback("edited");
}

function say(text, kind = "") {
  const msg = $("#action-msg");
  if (!msg) return;
  msg.className = `action-msg ${kind}`;
  msg.textContent = text;
}

const ACTION_DONE = { sent_as_is: "sent as is", edited: "edited and sent", rejected: "rejected" };

async function sendFeedback(action) {
  const cur = state.current;
  if (!cur?.result || cur.sent) return;
  const r = cur.result;
  const ta = $("#reply");
  if (action !== "rejected" && !ta.value.trim()) {
    say("The reply is empty.", "is-error");
    return;
  }
  const body = { ticket_id: r.ticket_id, input_sha256: r.input_sha256, route: r.decision.route, action };
  if (action === "edited") body.final_text = ta.value;
  if (action === "sent_as_is") body.final_text = cur.original;
  const btns = ["#act-send", "#act-edit", "#act-reject"].map((s) => $(s));
  btns.forEach((b) => { b.disabled = true; });
  try {
    await postJson("/api/feedback", body);
    cur.sent = true;
    ta.readOnly = true;
    if (cur.meta.sampleId) state.handled.set(cur.meta.sampleId, ACTION_DONE[action]);
    await refreshStats();
    const n = state.stats?.total;
    say(`Logged: ${ACTION_DONE[action]}. Feedback log now holds ${n ?? "?"} decision${n === 1 ? "" : "s"}.`, "is-ok");
    renderInbox();
  } catch (err) {
    btns.forEach((b) => { b.disabled = false; });
    onReplyInput();
    say(`Could not log the decision: ${err.message}`, "is-error");
  }
}

let audioUrl = null;
async function onListen() {
  const btn = $("#act-listen");
  const player = $("#player");
  if (!player.paused) {
    player.pause();
    btn.textContent = "Listen";
    return;
  }
  const text = $("#reply").value.trim().slice(0, 2000);
  if (!text) return;
  btn.disabled = true;
  btn.textContent = "Loading…";
  try {
    const res = await postJson("/api/tts", { text, language: state.current.result.classification.language || "en" });
    const blob = await res.blob();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);
    player.src = audioUrl;
    await player.play();
    btn.textContent = "Stop";
    player.onended = () => { btn.textContent = "Listen"; };
  } catch (err) {
    btn.textContent = "Listen";
    say(`Audio could not be played: ${(err.message || "unsupported audio").replace(/\.+$/, "")}.`, "is-error");
  } finally {
    btn.disabled = false;
  }
}

// ---------- Audit ----------

function auditBlock(r) {
  const u = r.usage;
  const sha = r.input_sha256;
  const copy = h("button", { type: "button", class: "copy", title: `Copy full hash ${sha}`, onclick: async (e) => {
    try { await navigator.clipboard.writeText(sha); e.currentTarget.textContent = "copied"; } catch { /* no clipboard */ }
  } }, sha.slice(0, 12));
  const item = (k, v, mono = false) => h("div", {}, h("dt", {}, k),
    h("dd", { class: mono ? "mono" : "", title: typeof v === "string" ? v : null }, v));
  return h("dl", { class: "audit", "aria-label": "Audit", style: "margin:0" },
    item("Model", r.model, true),
    item("Prompt", r.prompt_version, true),
    item("KB", r.kb_version.slice(0, 12), true),
    item("Input SHA-256", copy, true),
    item("Tokens in / out", `${u.input_tokens.toLocaleString()} / ${u.output_tokens.toLocaleString()}`),
    item("LLM calls", String(u.calls)),
    item("Cost USD", `$${u.cost_usd.toFixed(4)}`),
    item("Latency", fmtMs(r.total_latency_ms).join(" ")));
}

// ---------- Sources ----------

function renderSources(r) {
  const root = $("#sources");
  root.replaceChildren();
  const cites = r ? state.current.cites : new Map();
  const retrieved = new Map((r?.retrieved || []).map((s) => [s.chunk.id, s]));
  let totalChunks = 0;
  const pages = state.kb.pages.map((p) => {
    totalChunks += p.chunks.length;
    const cited = p.chunks.filter((c) => cites.has(c.id)).length;
    const got = p.chunks.filter((c) => retrieved.has(c.id) && !cites.has(c.id)).length;
    return { p, cited, got };
  });
  // Retrieved chunks the KB payload does not list still deserve a place.
  for (const [id, s] of retrieved) {
    if (!state.chunks.has(id)) {
      let entry = pages.find((x) => x.p.slug === s.chunk.page);
      if (!entry) {
        entry = { p: { slug: s.chunk.page, url: s.chunk.url, title: s.chunk.page, chunks: [] }, cited: 0, got: 0 };
        pages.push(entry);
      }
      entry.p.chunks.push({ id, heading: s.chunk.heading, text: s.chunk.text });
      if (cites.has(id)) entry.cited++; else entry.got++;
    }
  }
  pages.sort((a, b) => b.cited - a.cited || b.got - a.got);

  const nCited = cites.size;
  const nGot = [...retrieved.keys()].filter((id) => !cites.has(id)).length;
  $("#sources-count").textContent = `${pages.length} pages · ${totalChunks} sections`;
  $("#sources-sum").textContent = r
    ? (nCited || nGot
      ? `${nCited} cited · ${nGot} retrieved but not used. Hover a fact in the reply to find its quote.`
      : "Nothing retrieved for this ticket.")
    : `Help-centre knowledge base${state.kb.version ? `, version ${state.kb.version.slice(0, 7)}` : ""}.`;

  for (const { p, cited, got } of pages) root.append(pageCard(p, cited, got, cites, retrieved, Boolean(r)));
}

function pageCard(p, cited, got, cites, retrieved, hasResult) {
  const open = cited + got > 0;
  const bodyId = `pg-${p.slug}`;
  const body = h("div", { class: "page-body", id: bodyId, hidden: !open });
  const featured = p.chunks.filter((c) => cites.has(c.id) || retrieved.has(c.id));
  featured.sort((a, b) => (cites.get(a.id)?.n ?? 99) - (cites.get(b.id)?.n ?? 99) ||
    (retrieved.get(b.id)?.score ?? 0) - (retrieved.get(a.id)?.score ?? 0));
  const rest = p.chunks.filter((c) => !featured.includes(c));
  for (const c of featured) body.append(chunkCard(c, cites.get(c.id), retrieved.get(c.id)));
  if (rest.length) {
    const more = h("div", { hidden: featured.length > 0, style: "display:grid;gap:6px" },
      rest.map((c) => chunkCard(c, null, null)));
    if (featured.length) {
      const btn = h("button", { type: "button", class: "btn btn-ghost", style: "height:30px;font-size:12px;justify-self:start",
        "aria-expanded": "false", onclick: () => {
          more.hidden = !more.hidden;
          btn.setAttribute("aria-expanded", String(!more.hidden));
          btn.textContent = more.hidden ? `Show ${rest.length} other sections` : "Hide other sections";
        } }, `Show ${rest.length} other sections`);
      body.append(btn);
    }
    body.append(more);
  }
  const toggle = h("button", { type: "button", class: "page-toggle", "aria-expanded": String(open), "aria-controls": bodyId,
    onclick: () => {
      body.hidden = !body.hidden;
      toggle.setAttribute("aria-expanded", String(!body.hidden));
    } },
  h("span", { class: "chev", "aria-hidden": "true" }),
  h("span", { class: "page-title" }, p.title),
  h("span", { class: "page-badges" },
    cited ? h("span", { class: "pb pb-cited" }, `${cited} cited`) : null,
    got ? h("span", { class: "pb" }, `${got} retrieved`) : null,
    !hasResult || (!cited && !got) ? h("span", { class: "pb" }, `${p.chunks.length}`) : null));
  return h("article", { class: `page${cited ? " is-cited" : ""}` },
    h("div", { class: "page-head" }, toggle,
      h("a", { class: "page-link", href: p.url, target: "_blank", rel: "noopener noreferrer",
        title: `Open ${p.url} in a new tab` }, "Open", h("span", { class: "sr-only" }, ` ${p.title} (new tab)`))),
    body);
}

function chunkCard(c, cite, scored) {
  const kind = cite ? "is-cited" : scored ? "is-retrieved" : "";
  const open = Boolean(cite);
  const textId = `ck-${c.id.replace(/[^a-z0-9]/gi, "-")}`;
  const textEl = h("p", { class: "chunk-text", id: textId, dir: "auto" });
  const body = bodyOf(c);
  textEl.append(...(cite ? markQuotes(c, body, cite) : [body]));
  const wrap = h("div", { hidden: !open }, textEl, h("span", { class: "chunk-id" }, c.id));
  const head = h("button", { type: "button", class: "chunk-head", "aria-expanded": String(open), "aria-controls": textId,
    onclick: () => {
      wrap.hidden = !wrap.hidden;
      head.setAttribute("aria-expanded", String(!wrap.hidden));
    } },
  cite ? h("span", { class: "cite" }, String(cite.n)) : null,
  h("span", { class: "h" }, c.heading),
  cite ? h("span", { class: "chunk-tag" }, "Cited") : null,
  !cite && scored ? h("span", { class: "score", title: "BM25 retrieval score" }, `BM25 ${scored.score.toFixed(2)}`) : null);
  return h("div", { class: `chunk ${kind}`, "data-chunk": c.id }, head, wrap);
}

function findQuote(text, quote) {
  let at = text.indexOf(quote);
  if (at !== -1) return [at, at + quote.length];
  at = text.toLowerCase().indexOf(quote.toLowerCase());
  if (at !== -1) return [at, at + quote.length];
  // Whitespace-insensitive fallback.
  const pattern = quote.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const m = pattern && new RegExp(pattern, "i").exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

// Chunk text repeats its heading on the first line; the heading is already shown above it.
function bodyOf(c) {
  const t = c.text.trimStart();
  return t.startsWith(c.heading) ? t.slice(c.heading.length).trimStart() || t : t;
}

function markQuotes(c, text, cite) {
  const ranges = cite.quotes.map((q) => findQuote(text, q)).filter(Boolean).sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    out.push(text.slice(pos, s));
    out.push(h("mark", { class: "q", "data-chunk": c.id, tabindex: "0" },
      h("span", { class: "cite", "aria-hidden": "true" }, String(cite.n)), text.slice(s, e)));
    pos = e;
  }
  out.push(text.slice(pos));
  if (!ranges.length) out.push(h("span", { class: "chunk-id", style: "padding:6px 0 0;color:var(--amber-ink)" }, "Quote not found verbatim in this section."));
  return out;
}

// ---------- Sentence <-> source linking ----------

function wireSentences(card) {
  card.addEventListener("mouseover", (e) => {
    const s = e.target.closest(".sent-fact");
    if (s) linkFromSentence(s, false);
  });
  card.addEventListener("mouseout", (e) => {
    const s = e.target.closest(".sent-fact");
    if (s && !s.contains(e.relatedTarget)) clearLinks();
  });
  card.addEventListener("focusin", (e) => {
    const s = e.target.closest(".sent-fact");
    if (s) linkFromSentence(s, true);
  });
  card.addEventListener("focusout", (e) => { if (e.target.closest(".sent-fact")) clearLinks(); });
  card.addEventListener("click", (e) => {
    const s = e.target.closest(".sent-fact");
    if (s) linkFromSentence(s, true);
  });
  card.addEventListener("keydown", (e) => {
    const s = e.target.closest(".sent-fact");
    if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); linkFromSentence(s, true); }
  });
}

let lastLinked = null;
function linkFromSentence(sent, reveal) {
  const ids = (sent.dataset.chunks || "").split(" ").filter(Boolean);
  if (lastLinked === sent && !reveal) return;
  clearLinks();
  lastLinked = sent;
  document.body.classList.toggle("is-linking", ids.length > 0);
  sent.classList.add("is-linked");
  document.querySelectorAll(".sent-fact").forEach((x) => { if (x !== sent) x.classList.add("is-dim"); });
  document.querySelectorAll(".sent-courtesy").forEach((x) => x.classList.add("is-dim"));
  const chunks = ids.map((id) => document.querySelector(`.chunk[data-chunk="${CSS.escape(id)}"]`)).filter(Boolean);
  const marks = ids.flatMap((id) => [...document.querySelectorAll(`mark.q[data-chunk="${CSS.escape(id)}"]`)]);
  chunks.forEach((c) => {
    c.classList.add("is-linked");
    const page = c.closest(".page");
    const body = page?.querySelector(".page-body");
    if (body?.hidden) { body.hidden = false; page.querySelector(".page-toggle").setAttribute("aria-expanded", "true"); }
  });
  marks.forEach((m) => m.classList.add("is-linked"));
  if (chunks[0]) revealChunk(chunks[0], reveal);
  if (motion() && marks.length) {
    window.gsap.fromTo(marks, { backgroundColor: "#ffd23f" }, { backgroundColor: "#ffe27a", duration: 0.45, ease: "power2.out", overwrite: true });
  }
}

function linkFromChunk(id) {
  clearLinks();
  document.querySelectorAll(".sent").forEach((s) => {
    const hit = (s.dataset.chunks || "").split(" ").includes(id);
    s.classList.toggle("is-linked", hit);
    s.classList.toggle("is-dim", !hit);
  });
  document.querySelectorAll(`mark.q[data-chunk="${CSS.escape(id)}"]`).forEach((m) => m.classList.add("is-linked"));
}

function clearLinks() {
  lastLinked = null;
  document.body.classList.remove("is-linking");
  document.querySelectorAll(".is-linked, .is-dim").forEach((x) => x.classList.remove("is-linked", "is-dim"));
}

function revealChunk(chunk, force) {
  const col = $(".col-sources");
  if (wide.matches) {
    const cr = col.getBoundingClientRect();
    const r = chunk.getBoundingClientRect();
    const pad = 16;
    let delta = 0;
    if (r.top < cr.top + pad) delta = r.top - cr.top - pad;
    else if (r.bottom > cr.bottom - pad) delta = Math.min(r.bottom - cr.bottom + pad, r.top - cr.top - pad);
    if (delta) col.scrollBy({ top: delta, behavior: motion() ? "smooth" : "auto" });
  } else if (force) {
    chunk.scrollIntoView({ block: "center", behavior: motion() ? "smooth" : "auto" });
  }
}

function wireSourcesHover() {
  const root = $("#sources");
  const enter = (e) => {
    const m = e.target.closest("mark.q");
    if (m) linkFromChunk(m.dataset.chunk);
  };
  const leave = (e) => {
    const m = e.target.closest("mark.q");
    if (m && !m.contains(e.relatedTarget)) clearLinks();
  };
  root.addEventListener("mouseover", enter);
  root.addEventListener("mouseout", leave);
  root.addEventListener("focusin", enter);
  root.addEventListener("focusout", (e) => { if (e.target.closest("mark.q")) clearLinks(); });
}

// ---------- Motion ----------

function animateIn(wrap) {
  if (!motion()) return;
  const gsap = window.gsap;
  const cards = wrap.children;
  const steps = wrap.querySelectorAll(".rail .step");
  const fill = wrap.querySelector(".rail-fill");
  const bars = wrap.querySelectorAll(".budget-bar span");
  const badge = wrap.querySelector(".route-badge");
  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  tl.from(cards, { y: 10, autoAlpha: 0, duration: 0.32, stagger: 0.05, clearProps: "transform,opacity,visibility" }, 0);
  if (fill) tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 0.42, ease: "power1.inOut" }, 0.08);
  tl.from(steps, { autoAlpha: 0.25, duration: 0.18, stagger: 0.055, clearProps: "opacity,visibility" }, 0.08);
  tl.from(wrap.querySelectorAll(".rail .node"), { scale: 0.7, duration: 0.22, stagger: 0.055, ease: "back.out(2)", clearProps: "transform" }, 0.08);
  if (bars.length) tl.from(bars, { scaleX: 0, duration: 0.3, stagger: 0.03, clearProps: "transform" }, 0.2);
  if (badge) tl.from(badge, { scale: 0.94, duration: 0.25, ease: "back.out(2)", clearProps: "transform" }, 0.3);
}

// ---------- Compose and voice ----------

function wireCompose() {
  const form = $("#compose");
  const ta = $("#compose-text");
  $("#run-kbd").textContent = isMac ? "⌘ ↵" : "Ctrl ↵";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) {
      composeMsg("Type or paste a ticket first.", true);
      ta.focus();
      return;
    }
    composeMsg("");
    runTriage(text, null, { source: "Pasted", ticketText: text });
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
  });

  $("#upload-btn").addEventListener("click", () => $("#upload").click());
  $("#upload").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) sendVoice(f, f.name);
  });

  const mic = $("#mic");
  mic.addEventListener("pointerdown", (e) => { e.preventDefault(); mic.setPointerCapture?.(e.pointerId); startRec(); });
  mic.addEventListener("pointerup", stopRec);
  mic.addEventListener("pointercancel", stopRec);
  mic.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); startRec(); }
  });
  mic.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); stopRec(); } });
}

function composeMsg(text, error = false) {
  const p = $("#compose-msg");
  p.textContent = text;
  p.classList.toggle("is-error", error);
}

const rec = { recorder: null, chunks: [], started: 0, stream: null, pending: false };

async function startRec() {
  if (rec.recorder || rec.pending) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    composeMsg("This browser cannot record audio. Use Upload audio instead.", true);
    return;
  }
  rec.pending = true;
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    rec.pending = false;
    composeMsg("Microphone access was blocked.", true);
    return;
  }
  if (!rec.pending) { rec.stream.getTracks().forEach((t) => t.stop()); return; } // released before access
  rec.pending = false;
  const type = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  rec.recorder = new MediaRecorder(rec.stream, type ? { mimeType: type } : undefined);
  rec.chunks = [];
  rec.recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  rec.recorder.onstop = () => {
    rec.stream.getTracks().forEach((t) => t.stop());
    const ms = performance.now() - rec.started;
    const blob = new Blob(rec.chunks, { type: "audio/webm" });
    rec.recorder = null;
    if (ms < 500 || !blob.size) {
      composeMsg("Too short. Hold the button while you speak.", true);
      return;
    }
    sendVoice(blob, "recording.webm");
  };
  rec.started = performance.now();
  rec.recorder.start();
  const mic = $("#mic");
  mic.classList.add("is-recording");
  mic.setAttribute("aria-pressed", "true");
  $(".mic-label", mic).textContent = "Recording… release to send";
  composeMsg("");
}

function stopRec() {
  rec.pending = false;
  const mic = $("#mic");
  mic.classList.remove("is-recording");
  mic.setAttribute("aria-pressed", "false");
  $(".mic-label", mic).textContent = "Hold to record";
  if (rec.recorder?.state === "recording") rec.recorder.stop();
}

async function sendVoice(blob, name) {
  const seq = ++runSeq;
  state.current = { meta: { source: "Voice" }, result: null };
  markCurrentRow();
  showLoading("", { source: "Voice" }, "Transcribing audio…");
  const fd = new FormData();
  fd.append("audio", blob, name);
  try {
    const res = await api("/api/voice", { method: "POST", body: fd });
    const data = await res.json();
    if (seq !== runSeq) return;
    const text = data.transcript.text;
    showResult(data.result, { source: "Voice", ticketText: text, language: data.transcript.language }, data.transcript);
  } catch (err) {
    if (seq !== runSeq) return;
    showError("The audio could not be processed.", err.message);
  }
}

// ---------- Boot ----------

async function refreshStats() {
  try { state.stats = await getJson("/api/feedback/stats"); } catch { /* keep old */ }
  renderStatus();
}

function wireInboxKeys() {
  $("#inbox").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const all = [...document.querySelectorAll(".tk")];
    const i = all.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    all[Math.max(0, Math.min(all.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
  });
}

async function boot() {
  wireCompose();
  wireInboxKeys();
  wireSourcesHover();
  $("#filter").addEventListener("input", renderInbox);
  const [health, samples, kb, stats] = await Promise.allSettled([
    getJson("/api/health"), getJson("/api/samples"), getJson("/api/kb"), getJson("/api/feedback/stats"),
  ]);
  state.health = health.status === "fulfilled" ? health.value : null;
  state.samples = samples.status === "fulfilled" ? samples.value : [];
  if (kb.status === "fulfilled") state.kb = kb.value;
  for (const p of state.kb.pages) for (const c of p.chunks) state.chunks.set(c.id, c);
  state.stats = stats.status === "fulfilled" ? stats.value : null;
  renderStatus();
  renderInbox();
  if (samples.status === "rejected") $("#inbox").replaceChildren(h("p", { class: "muted pad" }, `Could not load tickets: ${samples.reason.message}`));
  if (kb.status === "rejected") $("#sources").replaceChildren(h("p", { class: "muted pad" }, `Could not load the knowledge base: ${kb.reason.message}`));
  else renderSources(null);
  const deep = new URLSearchParams(location.search).get("ticket");
  const s = deep && state.samples.find((x) => x.id === deep);
  if (s) openSample(s);
}

boot();
