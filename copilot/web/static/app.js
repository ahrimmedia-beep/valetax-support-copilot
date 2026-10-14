/* Operator console. Vanilla ES module, no build step.
   Talks to the Web API (see copilot/web/app.py) and renders one TriageResult at a time. */

const RTL = new Set(["ar", "ckb", "fa", "ur", "he"]);
const STEPS = ["guardrails", "redaction", "classify", "retrieve", "draft", "verify", "route"];
const STEP_NAMES = {
  guardrails: "Guardrails",
  redaction: "Redaction",
  classify: "Classify",
  retrieve: "Retrieve",
  draft: "Draft",
  verify: "Verify",
  route: "Route",
};
// Deterministic regex flags. These alone send a ticket to a human and are shown in red.
const HARD_FLAGS = ["trading_advice", "prompt_injection", "fraud", "legal_threat"];
const FLAG_LABELS = {
  trading_advice: "Trading advice",
  complaint: "Complaint",
  kyc_aml: "KYC / AML",
  account_blocked: "Account blocked",
  legal_threat: "Legal threat",
  fraud: "Fraud",
  money_issue: "Money issue",
  prompt_injection: "Prompt injection",
};
const ROUTE_TEXT = {
  auto_draft: ["Auto draft", "Grounded reply. Send after a glance."],
  human_review: ["Human review", "Read, decide and edit before sending."],
  decline_trading_advice: ["Decline: trading advice", "Fixed, compliance-approved text."],
};
const REASONS = {
  grounded_answer_all_checks_passed: "Grounded answer, every check passed",
  trading_advice: "Customer asks for trading advice",
  complaint: "Complaint",
  kyc_aml: "KYC or AML topic",
  account_blocked: "Account blocked",
  legal_threat: "Legal threat",
  fraud: "Possible fraud",
  money_issue: "Money missing or delayed",
  prompt_injection: "Prompt injection attempt",
  urgency_high: "High urgency",
  urgency_critical: "Critical urgency",
  negative_sentiment_money: "Negative tone on a money topic",
  abstained: "Draft held back",
  partially_covered: "KB answers only part of the question",
  specific_term_not_in_kb: "Ticket names something the KB does not mention",
  pipeline_error: "Pipeline error",
  kb_not_covered: "KB does not cover this question",
  low_retrieval_score: "No KB chunk matched well enough",
  citation_check_failed: "A citation did not match the source text",
  ungrounded_number: "Draft contained a number that is not in the KB",
  ungrounded_term: "Draft contained a term that is not in the KB",
  unsafe_reply: "Draft failed the reply safety scan",
  no_support_question: "No support question in the ticket",
  llm_error: "Model call failed",
};
const REASON_TONE = {
  grounded_answer_all_checks_passed: "green",
  trading_advice: "blue",
  prompt_injection: "red",
  fraud: "red",
  legal_threat: "red",
};

const state = {
  health: null,
  samples: [],
  kb: null,
  result: null,
  transcript: null,
  activeId: null,
  busy: false,
  editing: false,
  feedback: null,
  audio: null,
  recorder: null,
};

const $ = (sel) => document.querySelector(sel);
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((d) => d.msg).join("; ");
    } catch (_) {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res;
}

const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms < 10 ? ms.toFixed(2) : Math.round(ms)} ms`);
const dirFor = (lang) => (RTL.has(lang) ? "rtl" : "auto");
const reasonText = (code) => REASONS[code] || code.replaceAll("_", " ");
const shortHash = (s) => (s || "").slice(0, 8);

/* ---------- Top bar ---------- */

function renderStatus() {
  const box = $("#status");
  box.replaceChildren();
  const hc = state.health;
  if (!hc) return;
  const live = hc.provider === "openai";
  box.append(
    h("span", { class: `pill ${live ? "" : "off"}`, title: `LLM provider: ${hc.provider}` }, h("span", { class: "dot" }), live ? "Live" : "Fake provider", hc.model !== hc.provider ? h("b", { text: hc.model }) : null),
    h("span", { class: "pill" }, "KB", h("b", { text: shortHash(hc.kb_version) })),
    h("span", { class: "pill" }, "Prompt", h("b", { text: hc.prompt_version })),
    h("span", { class: "pill" }, "Speech", h("b", { text: hc.speech })),
  );
}

/* ---------- Inbox ---------- */

function renderSamples() {
  const list = $("#samples");
  list.replaceChildren();
  const groups = [
    ["core", "Core eval set"],
    ["real_themes", "Real-world themes"],
  ];
  for (const [key, title] of groups) {
    const rows = state.samples.filter((s) => s.group === key);
    if (!rows.length) continue;
    list.append(h("div", { class: "group-title" }, h("span", { text: title }), h("span", { text: String(rows.length) })));
    for (const s of rows) {
      list.append(
        h(
          "button",
          {
            type: "button",
            class: `sample ${s.id === state.activeId ? "active" : ""}`,
            "data-id": s.id,
            onclick: () => runSample(s),
          },
          h("span", { class: "lang", text: s.language }),
          h("span", { class: "text", dir: "auto", text: s.text.split("\n")[0] }),
          h("span", { class: "label", text: s.label }),
        ),
      );
    }
  }
  $("#sample-count").textContent = state.samples.length ? `${state.samples.length} tickets` : "";
}

function markActive() {
  for (const el of document.querySelectorAll(".sample")) el.classList.toggle("active", el.dataset.id === state.activeId);
}

async function runSample(s) {
  $("#ticket-text").value = s.text;
  state.activeId = s.id;
  markActive();
  await runTriage(s.text, s.id);
  if (window.innerWidth <= 900) $("#work").scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
}

/* ---------- Triage ---------- */

async function runTriage(text, id) {
  if (state.busy) return;
  text = (text || "").trim();
  if (!text) {
    note("Type or paste a ticket first.", true);
    return;
  }
  state.busy = true;
  state.transcript = null;
  state.feedback = null;
  state.editing = false;
  $("#run").disabled = true;
  note("");
  renderLoading(text);
  try {
    const res = await api("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { text, id } : { text }),
    });
    state.result = await res.json();
    renderResult();
  } catch (err) {
    renderError(`Co-pilot request failed: ${err.message}`, text);
  } finally {
    state.busy = false;
    $("#run").disabled = false;
  }
}

async function sendVoice(blob, filename) {
  if (state.busy) return;
  state.busy = true;
  state.feedback = null;
  state.editing = false;
  $("#run").disabled = true;
  note("Transcribing…");
  renderLoading("(voice message)");
  try {
    const form = new FormData();
    form.append("audio", blob, filename);
    const res = await api("/api/voice", { method: "POST", body: form });
    const body = await res.json();
    state.transcript = body.transcript;
    state.result = body.result;
    state.activeId = null;
    markActive();
    $("#ticket-text").value = body.transcript.text;
    note("");
    renderResult();
  } catch (err) {
    note("");
    renderError(`Voice request failed: ${err.message}`);
  } finally {
    state.busy = false;
    $("#run").disabled = false;
  }
}

function note(msg, isError = false) {
  const el = $("#compose-note");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

/* ---------- Work column ---------- */

function renderEmpty() {
  $("#work").replaceChildren(
    h(
      "div",
      { class: "empty" },
      h("h3", { text: "Pick a ticket or paste one" }),
      h("p", { text: "The co-pilot classifies the message, drafts a reply from the public help pages only, and tells you whether it is safe to send or needs a human." }),
      h("p", { text: "Every sentence of the draft points to the exact source line it came from." }),
    ),
  );
  renderKb();
}

function renderLoading(text) {
  const work = $("#work");
  work.replaceChildren(
    ticketCard(text, null),
    h(
      "section",
      { class: "card" },
      h("div", { class: "card-head" }, h("h3", { text: "Pipeline" }), h("span", { class: "meta", text: "Running…" })),
      rail(null),
    ),
    h("section", { class: "card" }, h("div", { class: "skeleton", style: "width:40%" }), h("div", { class: "skeleton", style: "width:70%;margin-top:10px" }), h("div", { class: "skeleton", style: "width:55%;margin-top:10px" })),
  );
  renderKb();
}

function renderError(message, text) {
  const work = $("#work");
  work.replaceChildren(
    text ? ticketCard(text, null) : null,
    h("div", { class: "banner error" }, message),
    h("button", { type: "button", class: "btn", onclick: () => runTriage($("#ticket-text").value, state.activeId) }, "Try again"),
  );
}

function ticketCard(text, r) {
  const lang = r ? r.classification.language : null;
  const head = h("div", { class: "card-head" }, h("h3", { text: r ? `Ticket ${r.ticket_id}` : "Ticket" }));
  if (lang) head.append(h("span", { class: "lang", text: lang }));
  if (r && r.guardrails.pii_types.length) {
    head.append(h("span", { class: "chip grey", title: "Removed before any model call" }, "PII redacted: ", r.guardrails.pii_types.join(", ")));
  }
  const card = h("section", { class: "card" }, head);
  if (state.transcript && r) {
    const t = state.transcript;
    card.append(
      h(
        "div",
        { class: "transcript" },
        h("span", {}, h("b", { text: "Voice transcript" })),
        h("span", { text: `language ${t.language}` }),
        h("span", { text: `${(t.duration_ms / 1000).toFixed(1)} s` }),
        h("span", { text: t.model }),
        h("span", { text: `$${Number(t.cost_usd).toFixed(4)}` }),
      ),
    );
  }
  card.append(h("p", { class: "ticket-text", dir: lang ? dirFor(lang) : "auto", text }));
  return card;
}

function stepState(step, r) {
  if (!r) return "is-pending";
  const d = step.detail || "";
  if (d.startsWith("skipped")) return "skip";
  if (step.step === "route") return `route-${r.decision.route}`;
  if (step.step === "guardrails") {
    if (d.startsWith("no flags")) return "ok";
    const hard = HARD_FLAGS.some((f) => r.guardrails[f] && r.guardrails[f].length);
    return hard ? "flag" : "warn";
  }
  if (step.step === "verify" && d.startsWith("failed")) return "warn";
  if (step.step === "draft" && d.startsWith("abstained")) return "warn";
  if (step.step === "redaction" && d.startsWith("redacted")) return "warn";
  return "ok";
}

// Trace details are written for logs; shorten the dense ones for the 7-column rail.
function prettyDetail(step) {
  const d = step.detail || "";
  if (step.step === "classify" && d.startsWith("category=")) {
    return d.split(/\s+/).map((kv) => kv.split("=")[1] || kv).join(" · ");
  }
  if (step.step === "retrieve") {
    const m = d.match(/^top (\d+) of (\d+) chunks.*score ([\d.]+)\)/);
    if (m) return `${m[1]} of ${m[2]} chunks · best ${m[3]}`;
  }
  if (step.step === "route") {
    const [route, rest] = d.split(/:\s*/, 2);
    const n = rest ? rest.split(",").length : 0;
    return n ? `${route.replaceAll("_", " ")} · ${n} reason${n === 1 ? "" : "s"}` : route.replaceAll("_", " ");
  }
  return d;
}

function rail(r) {
  const steps = r ? r.trace : STEPS.map((s) => ({ step: s, ms: 0, detail: "" }));
  const ol = h("ol", { class: `rail ${r ? "" : "loading"}` });
  for (const s of steps) {
    const cls = stepState(s, r);
    ol.append(
      h(
        "li",
        { class: `step ${cls}`, "data-step": s.step },
        h("span", { class: "node" }),
        h("span", { class: "name", text: STEP_NAMES[s.step] || s.step }),
        h("span", { class: "ms num" }, r && cls !== "skip" ? fmtMs(s.ms) : "—"),
        h("span", { class: "detail", title: s.detail, text: r ? prettyDetail(s) : "" }),
      ),
    );
  }
  return ol;
}

function classificationChips(r) {
  const c = r.classification;
  const chips = h("div", { class: "chips" });
  const kv = (k, v, cls = "") => h("span", { class: `chip ${cls}` }, h("span", { class: "k", text: `${k} ` }), v);
  chips.append(
    kv("category", c.category.replaceAll("_", " ")),
    kv("urgency", c.urgency, c.urgency === "critical" ? "red" : c.urgency === "high" ? "amber" : ""),
    kv("language", c.language),
    kv("sentiment", c.sentiment, c.sentiment === "negative" ? "amber" : ""),
  );
  for (const f of Object.keys(FLAG_LABELS)) {
    const hits = r.guardrails[f] || [];
    if (hits.length) {
      chips.append(
        h("span", { class: `chip ${HARD_FLAGS.includes(f) ? "red" : "amber"}`, title: `Matched: ${hits.join(" · ")}` }, "Rule: ", FLAG_LABELS[f]),
      );
    }
  }
  for (const t of c.sensitive_topics || []) {
    if (!(r.guardrails[t] || []).length) chips.append(h("span", { class: "chip amber" }, "Model: ", FLAG_LABELS[t] || t));
  }
  if (!c.sensitive_topics.length && !Object.keys(FLAG_LABELS).some((f) => (r.guardrails[f] || []).length)) {
    chips.append(h("span", { class: "chip green" }, "No flags"));
  }
  return chips;
}

function routeCard(r) {
  const route = r.decision.route;
  const [title, sub] = ROUTE_TEXT[route] || [route, ""];
  const reasons = h("ul", { class: "reasons" });
  for (const code of r.decision.reasons) {
    const tone = REASON_TONE[code] || (route === "human_review" ? "amber" : route === "auto_draft" ? "green" : "blue");
    reasons.append(h("li", { class: tone }, h("span", { text: reasonText(code) }), h("code", { text: code })));
  }
  if (r.errors && r.errors.length) {
    for (const e of r.errors) reasons.append(h("li", { class: "red" }, h("span", { text: e })));
  }
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("h3", { text: "Route" }), h("span", { class: "meta", text: "Rules only, no model in this step" })),
    h(
      "div",
      { class: "route" },
      h("div", { class: `route-badge ${route}`, id: "route-badge" }, h("span", { class: "big", text: title }), h("span", { class: "sub", text: sub })),
      reasons,
    ),
  );
}

/* Draft: sentences with citation markers. Hovering a fact sentence lights its source chunks. */
function draftView(r) {
  const d = r.draft;
  const lang = r.classification.language;
  const box = h("div", { class: "draft-view", dir: dirFor(lang), id: "draft-view" });
  const citeIndex = new Map(d.citations.map((c, i) => [c.chunk_id, i + 1]));
  if (d.sentences && d.sentences.length) {
    d.sentences.forEach((s, i) => {
      const isFact = s.kind === "fact" && s.chunk_ids.length;
      const span = h("span", { class: `sent ${s.kind}${isFact ? " fact" : ""}`, "data-chunks": s.chunk_ids.join(" "), tabindex: isFact ? "0" : null, role: isFact ? "button" : null }, s.text);
      if (isFact) {
        const refs = s.chunk_ids.map((id) => citeIndex.get(id)).filter(Boolean);
        if (refs.length) span.append(h("sup", { class: "ref", text: refs.join(",") }));
        span.addEventListener("mouseenter", () => light(s.chunk_ids, true));
        span.addEventListener("mouseleave", () => light(s.chunk_ids, false));
        span.addEventListener("focus", () => light(s.chunk_ids, true));
        span.addEventListener("blur", () => light(s.chunk_ids, false));
        const jump = () => revealChunk(s.chunk_ids[0]);
        span.addEventListener("click", jump);
        span.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            jump();
          }
        });
      }
      box.append(span, i < d.sentences.length - 1 ? " " : "");
    });
  } else {
    for (const para of d.reply.split(/\n{2,}/)) box.append(h("p", { style: "margin:0 0 8px", text: para }));
  }
  return box;
}

function draftCard(r) {
  const d = r.draft;
  const route = r.decision.route;
  const head = h("div", { class: "card-head" }, h("h3", { text: route === "decline_trading_advice" ? "Reply (fixed text)" : "Draft reply" }));
  if (d.coverage !== "not_applicable") {
    head.append(h("span", { class: `chip ${d.coverage === "full" ? "green" : d.coverage === "partial" ? "amber" : "grey"}` }, "coverage ", d.coverage));
    head.append(h("span", { class: "meta", text: `${d.citations_valid} of ${d.citations_proposed} citations verified` }));
  }
  const card = h("section", { class: "card" }, head);
  if (d.abstained) {
    const b = h("div", { class: "banner warn" }, h("b", { text: "Holding reply — KB does not cover this." }), " The customer gets an acknowledgement; a human answers.");
    const ul = h("ul");
    for (const p of d.problems) {
      const [code, rest] = p.split(/:(.*)/s);
      ul.append(h("li", {}, reasonText(code), rest ? h("span", { style: "color:var(--muted)", text: ` (${rest.trim()})` }) : null));
    }
    if (d.unanswered_terms.length) ul.append(h("li", {}, "Not in the KB: ", h("b", { text: d.unanswered_terms.join(", ") })));
    b.append(ul);
    card.append(b);
  } else if (route === "decline_trading_advice") {
    card.append(h("div", { class: "banner info" }, "Fixed compliance text in the customer's language. Nothing here was generated."));
  }

  const editor = h("textarea", { class: "draft-edit", id: "draft-edit", dir: dirFor(r.classification.language), "aria-label": "Edit reply" });
  editor.value = d.reply;
  card.append(state.editing ? editor : draftView(r));
  if (!state.editing && d.sentences && d.sentences.some((s) => s.kind === "fact")) {
    card.append(h("p", { class: "legend" }, h("span", {}, h("span", { class: "swatch" }), "Fact from a KB source: hover to see it, click to open"), h("span", { text: "Numbers are superscript citation refs" })));
  }

  const actions = h("div", { class: "actions" });
  const fb = state.feedback;
  if (fb) {
    actions.append(h("span", { class: `feedback ${fb.ok ? "ok" : "error"}`, text: fb.text }));
  } else if (state.editing) {
    actions.append(
      h("button", { type: "button", class: "btn primary", onclick: () => submitFeedback("edited", $("#draft-edit").value) }, "Send edited"),
      h("button", { type: "button", class: "btn", onclick: () => { state.editing = false; renderResult(false); } }, "Cancel"),
    );
  } else {
    actions.append(
      h("button", { type: "button", class: "btn primary", onclick: () => submitFeedback("sent_as_is", d.reply) }, "Send as is"),
      h("button", { type: "button", class: "btn", onclick: () => { state.editing = true; renderResult(false); $("#draft-edit").focus(); } }, "Edit & send"),
      h("button", { type: "button", class: "btn danger", onclick: () => submitFeedback("rejected", null) }, "Reject"),
      h("button", { type: "button", class: "btn", id: "listen", onclick: () => listen(d.reply, r.classification.language) }, "Listen"),
    );
  }
  card.append(actions);
  return card;
}

function auditCard(r) {
  const u = r.usage;
  const item = (k, v, mono = false) => h("div", {}, h("span", { class: `v ${mono ? "mono" : ""}`, text: v }), k);
  return h(
    "section",
    { class: "card" },
    h("div", { class: "card-head" }, h("h3", { text: "Audit" }), h("span", { class: "meta", text: "Stored with the decision" })),
    h(
      "div",
      { class: "audit" },
      item("model", r.model, true),
      item("prompt", r.prompt_version, true),
      item("KB version", r.kb_version, true),
      item("input SHA-256", `${shortHash(r.input_sha256)}…`, true),
      item("tokens in / out", `${u.input_tokens} / ${u.output_tokens}`),
      item("cost", `$${Number(u.cost_usd).toFixed(4)}`),
      item("model calls", String(u.calls)),
      item("latency", fmtMs(r.total_latency_ms)),
    ),
  );
}

function renderResult(animate = true) {
  const r = state.result;
  const work = $("#work");
  work.replaceChildren(
    ticketCard($("#ticket-text").value.trim() || "(empty)", r),
    h(
      "section",
      { class: "card" },
      h("div", { class: "card-head" }, h("h3", { text: "Pipeline" }), h("span", { class: "meta", text: `${r.trace.length} steps` }), h("div", { class: "right" }, h("span", { class: "num", text: fmtMs(r.total_latency_ms) }))),
      rail(r),
      h("div", { style: "margin-top:14px" }, classificationChips(r)),
    ),
    routeCard(r),
    draftCard(r),
    auditCard(r),
  );
  renderKb();
  if (animate) animateResult();
  if (animate) work.scrollTop = 0;
}

function animateResult() {
  if (reduced() || !window.gsap) return;
  const steps = document.querySelectorAll(".rail .step");
  const badge = $("#route-badge");
  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  tl.from(steps, { opacity: 0.25, duration: 0.2, stagger: 0.055 }, 0);
  tl.from(document.querySelectorAll(".rail .node"), { scale: 0.6, duration: 0.25, stagger: 0.055, ease: "back.out(2)" }, 0.02);
  if (badge) tl.from(badge, { scale: 0.9, opacity: 0, duration: 0.22, ease: "back.out(1.8)" }, 0.4);
}

/* ---------- Feedback, TTS ---------- */

async function submitFeedback(action, finalText) {
  const r = state.result;
  const payload = { ticket_id: r.ticket_id, input_sha256: r.input_sha256, route: r.decision.route, action };
  if (finalText != null) payload.final_text = finalText;
  try {
    await api("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const label = { sent_as_is: "Logged: sent as is", edited: "Logged: edited and sent", rejected: "Logged: rejected" }[action];
    state.feedback = { ok: true, text: label };
  } catch (err) {
    state.feedback = { ok: false, text: `Feedback not saved: ${err.message}` };
  }
  state.editing = false;
  renderResult(false);
}

async function listen(text, language) {
  const btn = $("#listen");
  if (state.audio) {
    state.audio.pause();
    state.audio = null;
    btn.textContent = "Listen";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Loading…";
  try {
    const res = await api("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 2000), language }) });
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    state.audio = audio;
    audio.addEventListener("ended", () => {
      state.audio = null;
      btn.textContent = "Listen";
      URL.revokeObjectURL(url);
    });
    await audio.play();
    btn.textContent = "Stop";
  } catch (err) {
    btn.textContent = "Listen";
    state.feedback = null;
    const actions = btn.closest(".actions");
    actions.querySelector(".feedback")?.remove();
    actions.append(h("span", { class: "feedback error", text: `Speech unavailable: ${err.message}` }));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Sources ---------- */

const chunkElId = (id) => `chunk-${id.replace(/[^a-z0-9]+/gi, "-")}`;

function markQuote(text, quotes) {
  const frag = document.createDocumentFragment();
  let rest = text;
  const q = quotes.find((x) => x && text.includes(x));
  if (!q) {
    frag.append(text);
    return frag;
  }
  const i = rest.indexOf(q);
  frag.append(rest.slice(0, i), h("mark", { text: q }), rest.slice(i + q.length));
  return frag;
}

function renderKb() {
  const box = $("#kb");
  box.replaceChildren();
  const kb = state.kb;
  if (!kb) return;
  const r = state.result;
  const cited = new Map();
  const retrieved = new Map();
  if (r) {
    for (const c of r.draft.citations) cited.set(c.chunk_id, [...(cited.get(c.chunk_id) || []), c.quote]);
    for (const s of r.retrieved) retrieved.set(s.chunk.id, s.score);
  }
  const citeOrder = r ? r.draft.citations.map((c) => c.chunk_id) : [];
  $("#kb-meta").textContent = `${kb.pages.length} pages · ${kb.pages.reduce((n, p) => n + p.chunks.length, 0)} chunks · ${shortHash(kb.version)}`;

  for (const page of kb.pages) {
    const nCited = page.chunks.filter((c) => cited.has(c.id)).length;
    const nRetrieved = page.chunks.filter((c) => retrieved.has(c.id)).length;
    const open = r ? nCited > 0 || nRetrieved > 0 : false;
    const summary = h(
      "summary",
      {},
      h("span", { class: "chev" }),
      h("span", { text: page.title }),
      nCited ? h("span", { class: "cited-n", text: `${nCited} cited` }) : h("span", { class: "n", text: `${page.chunks.length}` }),
      h(
        "a",
        { href: page.url, target: "_blank", rel: "noopener", title: `Open ${page.url}`, "aria-label": `Open ${page.title} on valetax.com`, onclick: (e) => e.stopPropagation() },
        h("svg", { width: "12", height: "12", viewBox: "0 0 12 12", "aria-hidden": "true" }),
      ),
    );
    summary.querySelector("svg").innerHTML = '<path d="M4.5 2H2.5A.5.5 0 0 0 2 2.5v7a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V7.5M7 2h3v3M10 2 5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>';
    const details = h("details", { class: "page", open });
    details.append(summary);
    for (const c of page.chunks) {
      const isCited = cited.has(c.id);
      const score = retrieved.get(c.id);
      const cls = isCited ? "cited" : score != null ? "retrieved" : "other";
      const head = h("div", { class: "h" });
      if (isCited) head.append(h("span", { class: "tag", text: String(citeOrder.indexOf(c.id) + 1) }));
      head.append(h("span", { text: c.heading }));
      if (score != null) head.append(h("span", { class: "score num", text: `BM25 ${score.toFixed(1)}` }));
      const body = h("p", { class: "body" });
      // FAQ chunk text starts with its own question; the heading already shows it.
      const text = c.text.startsWith(c.heading + "\n") ? c.text.slice(c.heading.length + 1) : c.text;
      body.append(isCited ? markQuote(text, cited.get(c.id)) : text);
      const el = h("div", { class: `chunk ${cls}`, id: chunkElId(c.id) }, head, body);
      if (cls !== "cited") head.addEventListener("click", () => el.classList.toggle("open"));
      details.append(el);
    }
    box.append(details);
  }
  if (!r) box.append(h("p", { class: "sources-note", text: "Public help pages the co-pilot may quote. Cited chunks open here with the exact quote marked." }));
}

function light(chunkIds, on) {
  for (const id of chunkIds) {
    const el = document.getElementById(chunkElId(id));
    if (!el) continue;
    el.classList.toggle("lit", on);
    if (on && !reduced() && window.gsap) {
      const marks = el.querySelectorAll("mark");
      if (marks.length) gsap.fromTo(marks, { backgroundColor: "#bfe9c9" }, { backgroundColor: "#e6f7e6", duration: 0.45, ease: "power1.out" });
    }
  }
  for (const s of document.querySelectorAll(".sent.fact")) {
    const ids = (s.dataset.chunks || "").split(" ");
    if (ids.some((i) => chunkIds.includes(i))) s.classList.toggle("lit", on);
  }
}

function revealChunk(id) {
  const el = document.getElementById(chunkElId(id));
  if (!el) return;
  const page = el.closest("details");
  if (page) page.open = true;
  el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
}

/* ---------- Voice input ---------- */

function setupVoice() {
  const mic = $("#mic");
  const file = $("#audio-file");
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    mic.disabled = true;
    mic.title = "Recording is not available in this browser";
  }
  let chunks = [];
  const start = async () => {
    if (state.recorder || state.busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      rec.addEventListener("dataavailable", (e) => e.data.size && chunks.push(e.data));
      rec.addEventListener("stop", () => {
        stream.getTracks().forEach((t) => t.stop());
        state.recorder = null;
        mic.classList.remove("recording");
        mic.setAttribute("aria-pressed", "false");
        mic.querySelector("span").textContent = "Hold to record";
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1000) {
          note("Recording too short.", true);
          return;
        }
        sendVoice(blob, "ticket.webm");
      });
      rec.start();
      state.recorder = rec;
      mic.classList.add("recording");
      mic.setAttribute("aria-pressed", "true");
      mic.querySelector("span").textContent = "Recording… release to send";
    } catch (err) {
      note(`Microphone unavailable: ${err.message}`, true);
    }
  };
  const stop = () => {
    if (state.recorder && state.recorder.state === "recording") state.recorder.stop();
  };
  mic.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    start();
  });
  mic.addEventListener("pointerup", stop);
  mic.addEventListener("pointerleave", stop);
  mic.addEventListener("pointercancel", stop);
  mic.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      start();
    }
  });
  mic.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") stop();
  });
  file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      note("Audio file is larger than 10 MB.", true);
      file.value = "";
      return;
    }
    sendVoice(f, f.name);
    file.value = "";
  });
}

/* ---------- Boot ---------- */

async function boot() {
  renderEmpty();
  setupVoice();
  $("#compose").addEventListener("submit", (e) => {
    e.preventDefault();
    state.activeId = null;
    markActive();
    runTriage($("#ticket-text").value);
  });
  $("#ticket-text").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      $("#compose").requestSubmit();
    }
  });
  if (window.innerWidth <= 900) $("#samples-wrap").open = false;

  const [health, samples, kb] = await Promise.allSettled([
    api("/api/health").then((r) => r.json()),
    api("/api/samples").then((r) => r.json()),
    api("/api/kb").then((r) => r.json()),
  ]);
  if (health.status === "fulfilled") state.health = health.value;
  else $("#status").append(h("span", { class: "pill off" }, h("span", { class: "dot" }), "API unreachable"));
  if (samples.status === "fulfilled") state.samples = samples.value;
  else $("#samples").append(h("p", { class: "sources-note", text: `Samples unavailable: ${samples.reason.message}` }));
  if (kb.status === "fulfilled") state.kb = kb.value;
  else $("#kb").append(h("p", { class: "sources-note", text: `KB unavailable: ${kb.reason.message}` }));
  renderStatus();
  renderSamples();
  renderKb();
}

boot();
