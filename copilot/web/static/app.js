// Operator console: one ticket at a time, every step of the pipeline visible,
// every fact in the reply traceable to the help-centre sentence it came from.

const RTL_LANGS = new Set(["ar", "ckb", "fa", "ur", "he"]);
const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHARS = /[A-Za-zЀ-ӿऀ-ॿ]/;
const STEPS = ["guardrails", "redaction", "classify", "retrieve", "draft", "verify", "route"];
const GROUPS = ["core", "real_themes"];

// ---------- i18n ----------
// Interface text only. Ticket texts, drafts, quotes, KB titles, model names and codes stay as data.
// Plural entries are objects keyed by Intl.PluralRules categories and read {n}.

const I18N = {
  en: {
    locale: "en-US",
    title: "Support Co-pilot · Valetax",
    skip: "Skip to ticket",
    brandAria: "Valetax Support Co-pilot",
    product: "Support Co-pilot",
    langGroup: "Interface language",
    bizCase: "Business case",
    // status
    apiDown: "API unreachable",
    live: "Live",
    fakeProvider: "Fake provider",
    tipModel: "Model that drafts and classifies. 'fake' = offline stub for tests.",
    tipKb: "Knowledge-base version: fingerprint of the 4 help pages. Stored with every answer.",
    tipPrompt: "Prompt version: fingerprint of the instructions to the model. Stored with every answer.",
    tipSpeech: "Speech-to-text and text-to-speech provider for the voice channel.",
    pillKb: "KB",
    pillPrompt: "Prompt",
    pillSpeech: "Speech",
    // inbox
    inbox: "Inbox",
    filterLabel: "Filter tickets",
    filterPh: "Filter by text, id or label",
    samplesAria: "Sample tickets",
    loadingTickets: "Loading tickets…",
    countOf: "{n} of {total}",
    noMatch: "No tickets match.",
    noSamples: "No sample tickets found.",
    "group.core": "Core eval set",
    "group.real_themes": "Real-world themes",
    langTitle: "Language: {l}",
    expectedTitle: "Expected: {label}",
    "gold.auto_draft": "auto",
    "gold.human_review": "review",
    "gold.decline_trading_advice": "decline",
    "done.sent_as_is": "sent as is",
    "done.edited": "edited and sent",
    "done.rejected": "rejected",
    loadTicketsFail: "Could not load tickets: {e}",
    loadKbFail: "Could not load the knowledge base: {e}",
    // compose
    newTicket: "New ticket",
    composePh: "Paste a customer message in any language",
    run: "Run co-pilot",
    record: "Record",
    recStop: "Stop · {time}",
    recStopAria: "Stop and send",
    upload: "Upload audio",
    typeFirst: "Type or paste a ticket first.",
    noRecorder: "This browser cannot record audio. Use Upload audio instead.",
    micBlocked: "Microphone access was blocked.",
    tooShort: "Too short. Speak for at least a second.",
    noToken: "Access token missing: open the demo link with ?token=…",
    // empty state
    emptyKicker: "No ticket open",
    emptyTitle: "Pick a ticket from the inbox, or paste one.",
    emptyText: "The co-pilot screens it, finds the help-centre answer and drafts a reply where every fact is cited. It then tells you whether the reply is safe to send, needs an agent, or must decline trading advice.",
    // loading and errors
    running: "Running the pipeline…",
    transcribing: "Transcribing audio…",
    triageFail: "The co-pilot could not process this ticket.",
    voiceFail: "The audio could not be processed.",
    // ticket card
    ticketAria: "Ticket",
    language: "Language",
    newTicketId: "new ticket",
    "src.core": "Core eval set",
    "src.real_themes": "Real-world themes",
    "src.sample": "Sample",
    "src.pasted": "Pasted",
    "src.voice": "Voice",
    matchesExpected: "Matches expected route ({r})",
    expectedGot: "Expected {e}, got {g}",
    voiceTranscript: "Voice transcript",
    trLanguage: "language {l}",
    trAudio: "{s} s audio",
    costNotReported: "cost not reported",
    guardrailTitle: "Guardrail: {l}",
    flaggedSr: " (flagged: {l})",
    // chips
    chipsAria: "Classification and flags",
    category: "Category",
    urgency: "Urgency",
    sentiment: "Sentiment",
    byRule: "rule",
    byModel: "model",
    matchedTitle: "Matched: {m}",
    byClassifier: "Raised by the classifier",
    piiRedacted: "PII redacted",
    piiTitle: "Redacted before the model saw the text",
    "flag.trading_advice": "Trading advice",
    "flag.prompt_injection": "Prompt injection",
    "flag.fraud": "Fraud",
    "flag.legal_threat": "Legal threat",
    "flag.account_blocked": "Account blocked",
    "flag.kyc_aml": "KYC / AML",
    "flag.complaint": "Complaint",
    "flag.money_issue": "Money issue",
    "cat.deposit": "deposit",
    "cat.withdrawal": "withdrawal",
    "cat.account_opening": "account opening",
    "cat.verification": "verification",
    "cat.trading_advice": "trading advice",
    "cat.complaint": "complaint",
    "cat.other": "other",
    "urg.low": "low",
    "urg.normal": "normal",
    "urg.high": "high",
    "urg.critical": "critical",
    "sent.negative": "negative",
    "sent.neutral": "neutral",
    "sent.positive": "positive",
    "pii.email": "email",
    "pii.phone": "phone",
    "pii.card": "card",
    "pii.iban": "IBAN",
    // pipeline
    pipeline: "Pipeline",
    traceAria: "Pipeline trace",
    stepsAria: "Pipeline steps",
    "step.guardrails": "Guardrails",
    "step.redaction": "Redaction",
    "step.classify": "Classify",
    "step.retrieve": "Retrieve",
    "step.draft": "Draft",
    "step.verify": "Verify",
    "step.route": "Route",
    "st.skipped": "Skipped",
    "st.failed": "Failed",
    "st.held": "Held",
    "st.flagged": "Flagged",
    "st.redacted": "Redacted",
    "st.passed": "Passed",
    "st.auto": "Auto",
    "st.review": "Review",
    "st.decline": "Decline",
    "st.done": "Done",
    notRun: "not run",
    stepsRan: "{n} of 7 steps ran",
    timeAria: "Time per step. Slowest: {s}",
    slowest: "Slowest ",
    modelTime: "Model time ",
    total: " · Total ",
    "unit.s": "s",
    "unit.ms": "ms",
    // route
    "route.auto_draft": "Auto-draft",
    "route.human_review": "Human review",
    "route.decline_trading_advice": "Decline: trading advice",
    "verdict.auto_draft": "Grounded and checked. Safe to send after a quick read.",
    "verdict.human_review": "An agent must read, decide and edit before anything is sent.",
    "verdict.decline_trading_advice": "Fixed, compliance-approved decline. No advice is given.",
    verdictDeclinePlus: "Fixed decline + checked answer. No advice is given; the answer covers only the support question.",
    routingAria: "Routing decision",
    whyAria: "Why",
    routeEyebrow: "Route",
    "sev.risk": "Risk",
    "sev.review": "Review",
    "sev.draft": "Draft",
    "sev.policy": "Policy",
    "sev.ok": "Passed",
    "sev.error": "Error",
    "why.grounded_answer_all_checks_passed": "Every fact is quoted from the help centre and all checks passed",
    "why.trading_advice": "Asks for trading or investment advice, which the broker cannot give",
    "why.complaint": "Complaint about the service or a transaction",
    "why.kyc_aml": "Verification or compliance (KYC / AML) matter",
    "why.account_blocked": "Account is blocked or restricted",
    "why.legal_threat": "Threatens legal action or a chargeback",
    "why.fraud": "Possible fraud or an unauthorised payment",
    "why.money_issue": "Customer money is missing, delayed or rejected",
    "why.prompt_injection": "Message tries to override the co-pilot's rules",
    "why.urgency_high": "High urgency",
    "why.urgency_critical": "Critical urgency",
    "why.negative_sentiment_money": "Upset customer writing about a deposit or withdrawal",
    "why.abstained": "Reply held back: nothing grounded to send",
    "why.partially_covered": "Help centre answers only part of the question",
    "why.specific_term_not_in_kb": "Mentions something the help centre does not cover",
    "why.pipeline_error": "A pipeline step failed, so the ticket falls back to a person",
    "why.kb_not_covered": "Help centre does not cover this question",
    "why.low_retrieval_score": "No help-centre article matched closely enough",
    "why.no_support_question": "No support question found to answer",
    "why.citation_check_failed": "A quote did not match its source word for word",
    "why.llm_error": "The model call failed",
    "why.uncited_fact": "A factual sentence had no citation",
    "why.bad_cite": "A sentence pointed to a citation that does not exist",
    "why.ungrounded_number": "A number in the reply is not in the sources",
    "why.ungrounded_term": "A term in the reply is not in the sources",
    "why.sentence_number_not_in_its_source": "A sentence uses a number its own source does not contain",
    "why.sentence_term_not_in_its_source": "A sentence uses a term its own source does not contain",
    "why.unsafe_reply": "Reply text tripped a safety rule",
    "why.fact_disguised": "A courtesy sentence states a fact without a citation",
    // reply
    draftReply: "Draft reply",
    "sub.edit": "Edit before sending",
    "sub.auto": "Ready after a read",
    "sub.declinePlus": "Fixed decline + checked answer",
    "sub.template": "Approved template",
    declineTitle: "Fixed decline (compliance template)",
    declineRest: "Sent first. Not generated, nothing to cite. The answer to the rest of the ticket follows below.",
    declineOnly: "Not generated, nothing to cite. No trading advice is given.",
    holdingTitle: "Holding reply: draft not used",
    holdingText: "The customer gets a neutral holding message. An agent writes the real answer.",
    problemsTitle: "Draft checks raised problems",
    factCited: "Fact, cited from {src}",
    sourceN: "source {n}",
    noSource: "no source",
    kindNoFacts: "{kind} sentence, states no facts",
    "kind.greeting": "greeting",
    "kind.closing": "closing",
    "kind.handoff": "handoff",
    evidence: "Evidence",
    facts: { one: "{n} fact", other: "{n} facts" },
    quotesVerified: "{v}/{p} quotes verified",
    coverage: "coverage {c}",
    "cov.full": "full",
    "cov.partial": "partial",
    "cov.none": "none",
    "cov.not_applicable": "not applicable",
    citedFact: "Cited fact",
    courtesy: "Courtesy",
    staleNote: "Reply edited. The evidence above refers to the original draft.",
    replyLabel: "Reply to customer",
    chars: "{n} chars",
    edited: " · edited",
    send: "Send as is",
    editSend: "Edit & send",
    reject: "Reject",
    listen: "Listen",
    stop: "Stop",
    loading: "Loading…",
    editFirst: "Edit the reply, then press Edit & send again.",
    replyEmpty: "The reply is empty.",
    logged: { one: "Logged: {a}. Feedback log now holds {n} decision.", other: "Logged: {a}. Feedback log now holds {n} decisions." },
    logFail: "Could not log the decision: {e}",
    audioFail: "Audio could not be played: {e}.",
    unsupportedAudio: "unsupported audio",
    // audit
    auditAria: "Audit",
    "audit.model": "Model",
    "audit.prompt": "Prompt",
    "audit.kb": "KB",
    "audit.sha": "Input SHA-256",
    "audit.tokens": "Tokens in / out",
    "audit.calls": "LLM calls",
    "audit.cost": "Cost USD",
    "audit.latency": "Latency",
    copyHash: "Copy full hash {h}",
    copied: "copied",
    // sources
    sources: "Sources",
    sourcesIntro: "Help-centre pages the reply may quote.",
    pages: { one: "{n} page", other: "{n} pages" },
    sections: { one: "{n} section", other: "{n} sections" },
    sumCited: "{c} cited · {g} retrieved but not used. Hover a fact in the reply to find its quote.",
    nothingRetrieved: "Nothing retrieved for this ticket.",
    kbSum: "Help-centre knowledge base.",
    kbSumVersion: "Help-centre knowledge base, version {v}.",
    badgeCited: "{n} cited",
    badgeRetrieved: "{n} retrieved",
    showOther: { one: "Show {n} other section", other: "Show {n} other sections" },
    hideOther: "Hide other sections",
    open: "Open",
    openTitle: "Open {u} in a new tab",
    newTab: " {t} (new tab)",
    chunkCited: "Cited",
    bm25Title: "BM25 retrieval score",
    quoteNotFound: "Quote not found verbatim in this section.",
  },
  ru: {
    locale: "ru-RU",
    title: "Ко-пилот поддержки · Valetax",
    skip: "К обращению",
    brandAria: "Valetax: ко-пилот поддержки",
    product: "Ко-пилот поддержки",
    langGroup: "Язык интерфейса",
    bizCase: "Бизнес-кейс",
    apiDown: "API недоступен",
    live: "Онлайн",
    fakeProvider: "Тестовая модель",
    tipModel: "Модель, которая ставит метки и пишет черновики. «fake» — офлайн-заглушка для тестов.",
    tipKb: "Версия базы знаний: отпечаток текста 4 страниц справки. Записывается в каждый ответ.",
    tipPrompt: "Версия промпта: отпечаток инструкций для модели. Записывается в каждый ответ.",
    tipSpeech: "Сервис распознавания и озвучки речи для голосового канала.",
    pillKb: "База",
    pillPrompt: "Промпт",
    pillSpeech: "Речь",
    inbox: "Входящие",
    filterLabel: "Фильтр обращений",
    filterPh: "Поиск по тексту, id или метке",
    samplesAria: "Примеры обращений",
    loadingTickets: "Загружаем обращения…",
    countOf: "{n} из {total}",
    noMatch: "Ничего не найдено.",
    noSamples: "Примеров обращений нет.",
    "group.core": "Основной тестовый набор",
    "group.real_themes": "Темы из реальных обращений",
    langTitle: "Язык: {l}",
    expectedTitle: "Ожидается: {label}",
    "gold.auto_draft": "авто",
    "gold.human_review": "человеку",
    "gold.decline_trading_advice": "отказ",
    "done.sent_as_is": "отправлен как есть",
    "done.edited": "исправлен и отправлен",
    "done.rejected": "отклонён",
    loadTicketsFail: "Не удалось загрузить обращения: {e}",
    loadKbFail: "Не удалось загрузить базу знаний: {e}",
    newTicket: "Новое обращение",
    composePh: "Вставьте сообщение клиента на любом языке",
    run: "Запустить",
    record: "Записать",
    recStop: "Остановить · {time}",
    recStopAria: "Остановить и отправить",
    upload: "Загрузить аудио",
    typeFirst: "Сначала введите или вставьте обращение.",
    noRecorder: "Этот браузер не умеет записывать звук. Воспользуйтесь кнопкой «Загрузить аудио».",
    micBlocked: "Доступ к микрофону запрещён.",
    tooShort: "Слишком коротко. Говорите хотя бы секунду.",
    noToken: "Нет токена доступа: откройте демо по ссылке с ?token=…",
    emptyKicker: "Обращение не открыто",
    emptyTitle: "Выберите обращение во входящих или вставьте своё.",
    emptyText: "Ко-пилот проверит его, найдёт ответ в справке и подготовит черновик, где у каждого факта есть ссылка на источник. Затем подскажет, можно ли отправлять ответ, нужен ли оператор или это отказ в торговом совете.",
    running: "Обрабатываем обращение…",
    transcribing: "Расшифровываем аудио…",
    triageFail: "Ко-пилот не смог обработать обращение.",
    voiceFail: "Не удалось обработать аудио.",
    ticketAria: "Обращение",
    language: "Язык",
    newTicketId: "новое обращение",
    "src.core": "Основной тестовый набор",
    "src.real_themes": "Темы из реальных обращений",
    "src.sample": "Пример",
    "src.pasted": "Вставлено вручную",
    "src.voice": "Голос",
    matchesExpected: "Совпадает с ожидаемым маршрутом ({r})",
    expectedGot: "Ожидался {e}, получен {g}",
    voiceTranscript: "Расшифровка голоса",
    trLanguage: "язык {l}",
    trAudio: "{s} с аудио",
    costNotReported: "стоимость не указана",
    guardrailTitle: "Фильтр: {l}",
    flaggedSr: " (отмечено: {l})",
    chipsAria: "Классификация и флаги",
    category: "Категория",
    urgency: "Срочность",
    sentiment: "Тон",
    byRule: "правило",
    byModel: "модель",
    matchedTitle: "Совпало: {m}",
    byClassifier: "Отметил классификатор",
    piiRedacted: "Скрыты ПДн",
    piiTitle: "Скрыто до того, как текст увидела модель",
    "flag.trading_advice": "Торговый совет",
    "flag.prompt_injection": "Промпт-инъекция",
    "flag.fraud": "Мошенничество",
    "flag.legal_threat": "Угроза судом",
    "flag.account_blocked": "Счёт заблокирован",
    "flag.kyc_aml": "KYC / AML",
    "flag.complaint": "Жалоба",
    "flag.money_issue": "Проблема с деньгами",
    "cat.deposit": "пополнение",
    "cat.withdrawal": "вывод",
    "cat.account_opening": "открытие счёта",
    "cat.verification": "верификация",
    "cat.trading_advice": "торговый совет",
    "cat.complaint": "жалоба",
    "cat.other": "другое",
    "urg.low": "низкая",
    "urg.normal": "обычная",
    "urg.high": "высокая",
    "urg.critical": "критическая",
    "sent.negative": "негативный",
    "sent.neutral": "нейтральный",
    "sent.positive": "позитивный",
    "pii.email": "почта",
    "pii.phone": "телефон",
    "pii.card": "карта",
    "pii.iban": "IBAN",
    pipeline: "Обработка",
    traceAria: "Ход обработки",
    stepsAria: "Этапы обработки",
    "step.guardrails": "Фильтры",
    "step.redaction": "Маскировка",
    "step.classify": "Разбор",
    "step.retrieve": "Поиск",
    "step.draft": "Черновик",
    "step.verify": "Проверка",
    "step.route": "Маршрут",
    "st.skipped": "Пропущен",
    "st.failed": "Ошибка",
    "st.held": "Удержан",
    "st.flagged": "Сработал",
    "st.redacted": "Скрыто",
    "st.passed": "Пройден",
    "st.auto": "Авто",
    "st.review": "Человеку",
    "st.decline": "Отказ",
    "st.done": "Готово",
    notRun: "не запускался",
    stepsRan: "Выполнено этапов: {n} из 7",
    timeAria: "Время по этапам. Дольше всего: {s}",
    slowest: "Дольше всего: ",
    modelTime: "Время модели ",
    total: " · Всего ",
    "unit.s": "с",
    "unit.ms": "мс",
    "route.auto_draft": "Готовый черновик",
    "route.human_review": "Человеку",
    "route.decline_trading_advice": "Отказ: торговый совет",
    "verdict.auto_draft": "Факты из справки, проверки пройдены. Можно отправлять после быстрого прочтения.",
    "verdict.human_review": "Оператор читает, принимает решение и правит ответ до отправки.",
    "verdict.decline_trading_advice": "Отказ по шаблону, согласованному с комплаенсом. Совет не даётся.",
    verdictDeclinePlus: "Отказ по шаблону и проверенный ответ. Совет не даётся, ответ касается только вопроса к поддержке.",
    routingAria: "Решение о маршруте",
    whyAria: "Причины",
    routeEyebrow: "Маршрут",
    "sev.risk": "Риск",
    "sev.review": "Проверка",
    "sev.draft": "Черновик",
    "sev.policy": "Правило",
    "sev.ok": "Пройдено",
    "sev.error": "Ошибка",
    "why.grounded_answer_all_checks_passed": "Каждый факт процитирован из справки, все проверки пройдены",
    "why.trading_advice": "Просит торговый или инвестиционный совет, а брокер не может его давать",
    "why.complaint": "Жалоба на сервис или операцию",
    "why.kyc_aml": "Вопрос верификации или комплаенса (KYC / AML)",
    "why.account_blocked": "Счёт заблокирован или ограничен",
    "why.legal_threat": "Угрожает судом или чарджбэком",
    "why.fraud": "Возможное мошенничество или несанкционированный платёж",
    "why.money_issue": "Деньги клиента пропали, задерживаются или отклонены",
    "why.prompt_injection": "Сообщение пытается обойти правила ко-пилота",
    "why.urgency_high": "Высокая срочность",
    "why.urgency_critical": "Критическая срочность",
    "why.negative_sentiment_money": "Недовольный клиент пишет о пополнении или выводе",
    "why.abstained": "Ответ удержан: нечего отправить с опорой на справку",
    "why.partially_covered": "Справка отвечает только на часть вопроса",
    "why.specific_term_not_in_kb": "Упоминается то, чего нет в справке",
    "why.pipeline_error": "Один из этапов упал, обращение уходит человеку",
    "why.kb_not_covered": "В справке нет ответа на этот вопрос",
    "why.low_retrieval_score": "Ни одна статья справки не подошла достаточно близко",
    "why.no_support_question": "В сообщении нет вопроса к поддержке",
    "why.citation_check_failed": "Цитата не совпала с источником слово в слово",
    "why.llm_error": "Вызов модели завершился ошибкой",
    "why.uncited_fact": "У предложения с фактом нет ссылки",
    "why.bad_cite": "Предложение ссылается на несуществующую цитату",
    "why.ungrounded_number": "Числа из ответа нет в источниках",
    "why.ungrounded_term": "Термина из ответа нет в источниках",
    "why.sentence_number_not_in_its_source": "В предложении число, которого нет в его источнике",
    "why.sentence_term_not_in_its_source": "В предложении термин, которого нет в его источнике",
    "why.unsafe_reply": "Текст ответа нарушил правило безопасности",
    "why.fact_disguised": "Вежливая фраза сообщает факт без ссылки",
    draftReply: "Черновик ответа",
    "sub.edit": "Править перед отправкой",
    "sub.auto": "Готов после прочтения",
    "sub.declinePlus": "Отказ по шаблону и проверенный ответ",
    "sub.template": "Утверждённый шаблон",
    declineTitle: "Отказ по шаблону (комплаенс)",
    declineRest: "Отправляется первым. Не генерируется, цитировать нечего. Ответ на остальную часть обращения ниже.",
    declineOnly: "Не генерируется, цитировать нечего. Торговый совет не даётся.",
    holdingTitle: "Ответ-заглушка: черновик не использован",
    holdingText: "Клиент получит нейтральное промежуточное сообщение. Настоящий ответ пишет оператор.",
    problemsTitle: "Проверки черновика нашли проблемы",
    factCited: "Факт, {src}",
    sourceN: "источник {n}",
    noSource: "без источника",
    kindNoFacts: "{kind}, без фактов",
    "kind.greeting": "Приветствие",
    "kind.closing": "Завершение",
    "kind.handoff": "Передача оператору",
    evidence: "Обоснование",
    facts: { one: "{n} факт", few: "{n} факта", many: "{n} фактов", other: "{n} факта" },
    quotesVerified: "{v}/{p} цитат проверено",
    coverage: "покрытие: {c}",
    "cov.full": "полное",
    "cov.partial": "частичное",
    "cov.none": "нет",
    "cov.not_applicable": "не применимо",
    citedFact: "Факт из справки",
    courtesy: "Вежливая фраза",
    staleNote: "Ответ изменён. Обоснование выше относится к исходному черновику.",
    replyLabel: "Ответ клиенту",
    chars: "{n} симв.",
    edited: " · изменён",
    send: "Отправить как есть",
    editSend: "Править и отправить",
    reject: "Отклонить",
    listen: "Прослушать",
    stop: "Стоп",
    loading: "Загрузка…",
    editFirst: "Измените ответ и снова нажмите «Править и отправить».",
    replyEmpty: "Ответ пустой.",
    logged: "Записано: {a}. Решений в журнале: {n}.",
    logFail: "Не удалось записать решение: {e}",
    audioFail: "Не удалось воспроизвести аудио: {e}.",
    unsupportedAudio: "формат не поддерживается",
    auditAria: "Аудит",
    "audit.model": "Модель",
    "audit.prompt": "Промпт",
    "audit.kb": "База знаний",
    "audit.sha": "SHA-256 входа",
    "audit.tokens": "Токены вход / выход",
    "audit.calls": "Вызовы LLM",
    "audit.cost": "Стоимость, USD",
    "audit.latency": "Время ответа",
    copyHash: "Скопировать полный хеш {h}",
    copied: "скопировано",
    sources: "Источники",
    sourcesIntro: "Страницы справки, которые может цитировать ответ.",
    pages: { one: "{n} страница", few: "{n} страницы", many: "{n} страниц", other: "{n} страницы" },
    sections: { one: "{n} раздел", few: "{n} раздела", many: "{n} разделов", other: "{n} раздела" },
    sumCited: "В ответе: {c} · найдено, но не использовано: {g}. Наведите на факт в ответе, чтобы увидеть цитату.",
    nothingRetrieved: "По этому обращению ничего не найдено.",
    kbSum: "База знаний справочного центра.",
    kbSumVersion: "База знаний справочного центра, версия {v}.",
    badgeCited: "в ответе: {n}",
    badgeRetrieved: "найдено: {n}",
    showOther: { one: "Показать ещё {n} раздел", few: "Показать ещё {n} раздела", many: "Показать ещё {n} разделов", other: "Показать ещё {n} раздела" },
    hideOther: "Скрыть остальные разделы",
    open: "Открыть",
    openTitle: "Открыть {u} в новой вкладке",
    newTab: " {t} (новая вкладка)",
    chunkCited: "Цитата",
    bm25Title: "Оценка поиска BM25",
    quoteNotFound: "Цитата не найдена в этом разделе дословно.",
  },
};

const LS_KEY = "bc-lang"; // shared with the business-case page
let lang = "en";
let plural = new Intl.PluralRules("en-US");
const nfCache = new Map();

function t(key, vars = {}) {
  let v = I18N[lang][key] ?? I18N.en[key];
  if (v === undefined) return key;
  if (typeof v === "object") v = v[plural.select(Number(vars.n) || 0)] ?? v.other;
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
const tOr = (key, fallback) => (I18N[lang][key] ?? I18N.en[key] ?? fallback);

// Locale-aware number with a fixed number of decimals.
function num(x, digits = 0) {
  const k = `${lang}:${digits}`;
  if (!nfCache.has(k)) {
    nfCache.set(k, new Intl.NumberFormat(I18N[lang].locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  return nfCache.get(k).format(x);
}

function initialLang() {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "ru" || q === "en") return q;
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch { /* storage unavailable */ }
  return "en";
}

// Guardrail flags. Red is kept for the hard rules only.
const FLAG_TONE = {
  trading_advice: "blue",
  prompt_injection: "red",
  fraud: "red",
  legal_threat: "red",
  account_blocked: "amber",
  kyc_aml: "amber",
  complaint: "amber",
  money_issue: "amber",
};
const flagLabel = (key) => t(`flag.${key}`);

const ROUTE_CLASS = { auto_draft: "r-auto", human_review: "r-review", decline_trading_advice: "r-decline" };

// Routing and draft codes -> severity; the plain-language reason lives in I18N under "why.<code>".
const SEV_CLASS = { risk: "sev-block", review: "sev-review", draft: "sev-review", policy: "sev-info", ok: "sev-ok", error: "sev-block" };
const REASON_SEV = {
  grounded_answer_all_checks_passed: "ok",
  trading_advice: "policy",
  complaint: "review",
  kyc_aml: "review",
  account_blocked: "review",
  legal_threat: "risk",
  fraud: "risk",
  money_issue: "review",
  prompt_injection: "risk",
  urgency_high: "review",
  urgency_critical: "risk",
  negative_sentiment_money: "review",
  abstained: "draft",
  partially_covered: "draft",
  specific_term_not_in_kb: "draft",
  pipeline_error: "error",
  kb_not_covered: "draft",
  low_retrieval_score: "draft",
  no_support_question: "draft",
  citation_check_failed: "draft",
  llm_error: "error",
  uncited_fact: "draft",
  bad_cite: "draft",
  ungrounded_number: "draft",
  ungrounded_term: "draft",
  sentence_number_not_in_its_source: "draft",
  sentence_term_not_in_its_source: "draft",
  unsafe_reply: "risk",
};

function reasonInfo(code) {
  if (REASON_SEV[code]) return [REASON_SEV[code], t(`why.${code}`)];
  if (code.startsWith("fact_disguised_as_")) return ["draft", t("why.fact_disguised")];
  const words = code.replace(/_/g, " ");
  return ["review", words.charAt(0).toUpperCase() + words.slice(1)];
}

const state = {
  health: null,
  samples: [],
  kb: { version: "", pages: [] },
  kbError: null,
  samplesError: null,
  chunks: new Map(),
  stats: null,
  current: null, // { result, meta, original, cites, sent, transcript, said }
  handled: new Map(), // sample id -> feedback action
};
// What the workspace shows, so a language switch can redraw it without a new request.
let view = { kind: "empty" };
let composeState = null; // { key, error }

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
  if (ms >= 1000) return [num(ms / 1000, 2), t("unit.s")];
  if (ms >= 100) return [num(Math.round(ms)), t("unit.ms")];
  if (ms >= 10) return [num(ms, 1), t("unit.ms")];
  return [num(ms, 2), t("unit.ms")];
}

function isRtl(lng, text) {
  if (RTL_LANGS.has((lng || "").toLowerCase())) return true;
  const first = (text || "").match(new RegExp(`${RTL_CHARS.source}|${LTR_CHARS.source}`));
  return Boolean(first && RTL_CHARS.test(first[0]));
}
const dirFor = (lng, text) => (isRtl(lng, text) ? "rtl" : "auto");
const firstLine = (s) => s.split(/\n/).find((l) => l.trim()) || s;
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
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res;
}
const getJson = async (path) => (await api(path)).json();
const postJson = async (path, body) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---------- Language ----------

function applyStatic() {
  document.documentElement.lang = lang;
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll(".lang-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  const biz = $("#biz-link");
  if (biz) {
    const q = new URLSearchParams({ lang });
    if (DEMO_TOKEN) q.set("token", DEMO_TOKEN);
    biz.setAttribute("href", `/business-case?${q}`);
  }
  if (rec.recorder) updateRecLabel();
}

function setLang(l, persist) {
  lang = I18N[l] ? l : "en";
  plural = new Intl.PluralRules(I18N[lang].locale);
  if (persist) {
    try { localStorage.setItem(LS_KEY, lang); } catch { /* storage unavailable */ }
    try {
      const u = new URL(location.href);
      u.searchParams.set("lang", lang);
      history.replaceState(null, "", u);
    } catch { /* ignore */ }
  }
  applyStatic();
}

// Redraw everything that was built from data, in the new language, from what is already in memory.
function rerender() {
  renderStatus();
  renderInbox();
  if (composeState) composeMsg(composeState.key, composeState.error);
  if (view.kind === "result" && state.current?.result) {
    const ta = $("#reply");
    const draft = ta ? ta.value : null;
    renderResult(false);
    const fresh = $("#reply");
    if (draft !== null && fresh) fresh.value = draft;
    onReplyInput();
    if (state.current.sent) {
      fresh.readOnly = true;
      ["#act-send", "#act-edit", "#act-reject"].forEach((s) => { $(s).disabled = true; });
    }
    const said = state.current.said;
    if (said) say(said.key, said.vars, said.kind);
  } else if (view.kind === "loading") {
    showLoading(view.text, view.meta, view.labelKey);
  } else if (view.kind === "error") {
    showError(view.titleKey, view.detail);
  } else {
    renderSourcesOrError(null);
  }
}

function wireLang() {
  document.querySelectorAll(".lang-switch button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    setLang(b.dataset.lang, true);
    rerender();
  }));
}

// ---------- Top bar ----------

function renderStatus() {
  const box = $("#status");
  box.replaceChildren();
  const hc = state.health;
  if (!hc) {
    box.append(h("span", { class: "pill off" }, h("span", { class: "dot" }), t("apiDown")));
    return;
  }
  const live = hc.provider === "openai";
  // Tooltip on hover (title) and the same text for screen readers.
  const pill = (cls, tip, ...kids) => h("span", { class: `pill ${cls}`, title: tip },
    ...kids, h("span", { class: "sr-only" }, `. ${tip}`));
  box.append(
    pill(live ? "" : "off", t("tipModel"),
      h("span", { class: "dot" }), live ? t("live") : t("fakeProvider"),
      hc.model !== hc.provider ? h("b", {}, hc.model) : null),
    pill("", t("tipKb"), t("pillKb"), h("b", {}, hc.kb_version.slice(0, 8))),
    pill("", t("tipPrompt"), t("pillPrompt"), h("b", {}, hc.prompt_version)),
    pill("", t("tipSpeech"), t("pillSpeech"), h("b", {}, hc.speech)),
  );
}

// ---------- Inbox ----------

function renderInbox() {
  const nav = $("#inbox");
  if (state.samplesError) {
    nav.replaceChildren(h("p", { class: "muted pad" }, t("loadTicketsFail", { e: state.samplesError })));
    return;
  }
  const q = $("#filter").value.trim().toLowerCase();
  const rows = state.samples.filter(
    (s) => !q || `${s.id} ${s.text} ${s.label} ${s.language}`.toLowerCase().includes(q),
  );
  nav.replaceChildren();
  $("#inbox-count").textContent = q ? t("countOf", { n: rows.length, total: state.samples.length }) : String(state.samples.length);
  if (!rows.length) {
    nav.append(h("p", { class: "muted pad" }, state.samples.length ? t("noMatch") : t("noSamples")));
    return;
  }
  for (const group of GROUPS) {
    const items = rows.filter((s) => s.group === group);
    if (!items.length) continue;
    const list = h("div", { role: "list" });
    for (const s of items) list.append(h("div", { role: "listitem" }, inboxRow(s)));
    nav.append(
      h("div", { class: "group" },
        h("h3", { class: "group-head" }, h("span", {}, t(`group.${group}`)), h("span", {}, String(items.length))),
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
    h("span", { class: "lang", title: t("langTitle", { l: s.language }) }, s.language || "—"),
    h("span", { class: "tk-text", dir: dirFor(s.language, s.text) }, firstLine(s.text)),
    h("span", { class: "tk-meta" },
      h("span", { class: "id" }, s.id),
      h("span", { class: "gold", title: t("expectedTitle", { label: s.label }) }, goldShort(s.label)),
      done ? h("span", { class: "gold", style: "color:var(--green-ink)" }, `· ${t(`done.${done}`)}`) : null),
  );
}

const GOLD_ROUTE = { auto_draft: "auto", human_review: "review", decline_trading_advice: "decline" };
function goldShort(label) {
  const [route, cat = ""] = label.split(" · ");
  const r = GOLD_ROUTE[route] || route;
  const catText = cat ? tOr(`cat.${cat}`, cat.replace(/_/g, " ")) : "";
  return h("span", { class: `gold-route g-${r}` }, tOr(`gold.${route}`, route),
    h("span", { class: "gold-cat" }, ` · ${catText}`));
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
  runTriage(s.text, s.id, { sampleId: s.id, source: s.group || "sample", language: s.language, gold: s.label, ticketText: s.text });
}

// ---------- Triage ----------

let runSeq = 0;

async function runTriage(text, id, meta) {
  const seq = ++runSeq;
  state.current = { meta, result: null };
  markCurrentRow();
  showLoading(text, meta, "running");
  try {
    const res = await postJson("/api/triage", id ? { text, id } : { text });
    const result = await res.json();
    if (seq !== runSeq) return;
    showResult(result, meta);
  } catch (err) {
    if (seq !== runSeq) return;
    if (err.status === 401) showError("noToken", "");
    else showError("triageFail", err.message);
  }
}

function setBusy(busy) {
  $("#workspace").setAttribute("aria-busy", busy ? "true" : "false");
  $("#run").disabled = busy;
}

function showLoading(text, meta, labelKey) {
  view = { kind: "loading", text, meta, labelKey };
  setBusy(true);
  $("#empty").hidden = true;
  const box = $("#result");
  box.hidden = false;
  const rail = h("ol", { class: "rail" }, h("span", { class: "rail-track", "aria-hidden": "true" }),
    STEPS.map((s, i) => h("li", { class: "step st-skip" },
      h("span", { class: "node" }, String(i + 1)), h("span", { class: "step-name" }, t(`step.${s}`)))));
  box.replaceChildren(h("div", { class: "result loading" },
    text ? ticketCard(text, meta, null) : null,
    h("section", { class: "card trace" },
      h("div", { class: "card-head", style: "padding:0" },
        h("h2", { class: "card-title" }, t("pipeline")), h("span", { class: "card-sub" }, t(labelKey))),
      rail),
    h("section", { class: "card card-body" },
      h("div", { class: "skeleton", style: "width:60%" }), h("div", { class: "skeleton", style: "width:85%;margin-top:10px" }),
      h("div", { class: "skeleton", style: "width:40%;margin-top:10px" })),
  ));
}

function showError(titleKey, detail) {
  view = { kind: "error", titleKey, detail };
  setBusy(false);
  $("#empty").hidden = true;
  const box = $("#result");
  box.hidden = false;
  box.replaceChildren(h("div", { class: "result" },
    h("section", { class: "card error-card", role: "alert" }, h("strong", {}, t(titleKey)), detail)));
}

function showResult(r, meta, transcript = null) {
  const cites = citationIndex(r.draft);
  state.current = { result: r, meta, cites, original: r.draft.reply, sent: false, transcript, said: null };
  renderResult(true);
}

function renderResult(fresh) {
  view = { kind: "result" };
  setBusy(false);
  const { result: r, meta, transcript } = state.current;
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
  if (!fresh) return;
  animateIn(wrap);
  if (!wide.matches) $("#workspace").scrollIntoView({ block: "start", behavior: motion() ? "smooth" : "auto" });
}

// Ticket text with the guardrail matches highlighted in place.
function ticketCard(text, meta, r, transcript = null) {
  const lng = meta.language || r?.classification.language || "";
  const metaRow = h("div", { class: "ticket-meta" },
    h("span", { class: "lang", title: t("language") }, lng || "—"),
    h("span", { class: "mono" }, r?.ticket_id || meta.sampleId || t("newTicketId")),
    h("span", { class: "sep", "aria-hidden": "true" }, "|"),
    h("span", {}, tOr(`src.${meta.source}`, t("src.sample"))),
  );
  if (meta.gold && r) {
    const goldRoute = meta.gold.split(" · ")[0];
    const ok = goldRoute === r.decision.route;
    metaRow.append(h("span", { class: "sep", "aria-hidden": "true" }, "|"),
      h("span", { class: `expect ${ok ? "is-match" : "is-miss"}` },
        h("span", { class: "tick", "aria-hidden": "true" }, ok ? "✓" : "≠"),
        ok ? t("matchesExpected", { r: goldRoute }) : t("expectedGot", { e: goldRoute, g: r.decision.route })));
  }
  const body = h("p", { class: "ticket-text", dir: dirFor(lng, text), lang: lng || null });
  body.append(...highlightFlags(text, r?.guardrails));
  return h("section", { class: "card card-body", "aria-label": t("ticketAria") },
    transcript ? h("div", { class: "transcript" },
      h("b", {}, t("voiceTranscript")),
      transcript.language ? h("span", {}, t("trLanguage", { l: transcript.language })) : null,
      transcript.duration_ms ? h("span", {}, t("trAudio", { s: num(transcript.duration_ms / 1000, 1) })) : null,
      h("span", {}, transcript.model),
      h("span", {}, !transcript.duration_ms && !transcript.cost_usd
        ? t("costNotReported")
        : `$${num(Number(transcript.cost_usd || 0), 4)}`)) : null,
    metaRow, body, r ? chipsRow(r) : null);
}

function highlightFlags(text, flags) {
  if (!flags) return [text];
  const ranges = [];
  const lower = text.toLowerCase();
  for (const [key, tone] of Object.entries(FLAG_TONE)) {
    const label = flagLabel(key);
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
    out.push(h("mark", { class: `hit hit-${rg.tone}`, title: t("guardrailTitle", { l: rg.label }) },
      text.slice(rg.start, rg.end), h("span", { class: "sr-only" }, t("flaggedSr", { l: rg.label }))));
    pos = rg.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function chipsRow(r) {
  const c = r.classification;
  const chip = (k, v, cls = "") => h("span", { class: `chip ${cls}` }, h("b", {}, k), v);
  const row = h("div", { class: "chips", "aria-label": t("chipsAria") },
    chip(t("category"), tOr(`cat.${c.category}`, c.category.replace(/_/g, " "))),
    chip(t("urgency"), tOr(`urg.${c.urgency}`, c.urgency), c.urgency === "critical" ? "chip-red" : c.urgency === "high" ? "chip-amber" : ""),
    chip(t("language"), c.language),
    chip(t("sentiment"), tOr(`sent.${c.sentiment}`, c.sentiment), c.sentiment === "negative" ? "chip-amber" : ""),
  );
  const g = r.guardrails;
  const seen = new Set();
  for (const [key, tone] of Object.entries(FLAG_TONE)) {
    const hit = (g[key] || []).length || c.sensitive_topics.includes(key);
    if (!hit || seen.has(key)) continue;
    seen.add(key);
    const byRule = (g[key] || []).length > 0;
    row.append(h("span", {
      class: `chip chip-flag chip-${tone}`,
      title: byRule ? t("matchedTitle", { m: g[key].join(" | ") }) : t("byClassifier"),
    }, flagLabel(key), h("b", {}, byRule ? t("byRule") : t("byModel"))));
  }
  if (g.pii_types.length) {
    row.append(h("span", { class: "chip", title: t("piiTitle") },
      h("b", {}, t("piiRedacted")), g.pii_types.map((p) => tOr(`pii.${p}`, p)).join(", ")));
  }
  return row;
}

// ---------- Pipeline trace ----------

function stepTone(st, r) {
  const d = st.detail || "";
  if (d.startsWith("skipped")) return ["skip", t("st.skipped")];
  if (d.startsWith("failed")) return ["fail", t("st.failed")];
  if (d.startsWith("abstained")) return ["warn", t("st.held")];
  if (st.step === "guardrails" && !d.startsWith("no flags")) {
    const tones = Object.entries(FLAG_TONE).filter(([k]) => (r.guardrails[k] || []).length).map(([, v]) => v);
    if (tones.includes("red")) return ["fail", t("st.flagged")];
    if (tones.includes("amber")) return ["warn", t("st.flagged")];
    return ["info", t("st.flagged")];
  }
  if (st.step === "redaction" && d.startsWith("redacted")) return ["info", t("st.redacted")];
  if (st.step === "verify") return ["ok", t("st.passed")];
  if (st.step === "route") {
    const rt = r.decision.route;
    return rt === "auto_draft" ? ["ok", t("st.auto")] : rt === "human_review" ? ["warn", t("st.review")] : ["info", t("st.decline")];
  }
  return ["ok", t("st.done")];
}

function traceCard(r) {
  const byStep = new Map(r.trace.map((s) => [s.step, s]));
  const steps = STEPS.map((s) => byStep.get(s) || { step: s, ms: 0, detail: t("notRun") });
  const total = steps.reduce((a, s) => a + s.ms, 0);
  const stepName = (s) => t(`step.${s}`);
  const rail = h("ol", { class: "rail", "aria-label": t("stepsAria") },
    h("span", { class: "rail-track", "aria-hidden": "true" }),
    h("span", { class: "rail-fill", "aria-hidden": "true" }),
    steps.map((s, i) => {
      const [tone, label] = stepTone(s, r);
      const [n, unit] = fmtMs(s.ms);
      return h("li", { class: `step st-${tone}`, title: s.detail },
        h("span", { class: "node", "aria-hidden": "true" }, String(i + 1)),
        h("span", { class: "step-name" }, stepName(s.step)),
        h("span", { class: "step-ms" }, n, h("small", {}, ` ${unit}`)),
        h("span", { class: "step-state" }, label),
        h("span", { class: "step-detail" }, s.detail.replace(/([=,_#:])/g, "$1​")));
    }));
  const slowest = steps.reduce((a, s) => (s.ms > a.ms ? s : a), steps[0]);
  const bar = h("div", { class: "budget-bar", role: "img",
    "aria-label": t("timeAria", { s: stepName(slowest.step) }) },
  steps.map((s) => h("span", {
    class: s === slowest && s.ms > 0 ? "is-big" : "",
    style: `flex-grow:${Math.max(s.ms, total * 0.012 || 1)}`,
    title: `${stepName(s.step)}: ${fmtMs(s.ms).join(" ")}`,
  })));
  const [tn, tu] = fmtMs(r.total_latency_ms);
  const [ln, lu] = fmtMs(r.usage.llm_latency_ms);
  const ran = steps.filter((s) => !s.detail.startsWith("skipped")).length;
  return h("section", { class: "card trace", "aria-label": t("traceAria") },
    h("div", { class: "card-head", style: "padding:0" },
      h("h2", { class: "card-title" }, t("pipeline")),
      h("span", { class: "card-sub" }, t("stepsRan", { n: ran }))),
    rail,
    h("div", { class: "budget" }, bar,
      h("div", { class: "budget-legend" },
        h("span", {}, t("slowest"), h("b", {}, stepName(slowest.step)), ` ${fmtMs(slowest.ms).join(" ")}`),
        h("span", {}, t("modelTime"), h("b", {}, `${ln} ${lu}`), t("total"), h("b", {}, `${tn} ${tu}`)))));
}

// ---------- Route ----------

// A decline followed by an answer that passed the draft checks (not a holding reply).
const declinePlusAnswer = (r) =>
  r.decision.route === "decline_trading_advice" && !r.draft.abstained && r.draft.sentences.length > 0;

function routeCard(r) {
  const code = r.decision.route;
  const known = Boolean(ROUTE_CLASS[code]);
  const title = known ? t(`route.${code}`) : code;
  const verdict = declinePlusAnswer(r) ? t("verdictDeclinePlus") : known ? t(`verdict.${code}`) : "";
  const list = h("ul", { class: "reasons", "aria-label": t("whyAria") });
  for (const rc of r.decision.reasons) {
    const [sev, text] = reasonInfo(rc);
    let extra = null;
    if (rc === "specific_term_not_in_kb" && r.draft.unanswered_terms.length) {
      extra = h("small", {}, ` (${r.draft.unanswered_terms.join(", ")})`);
    }
    list.append(h("li", { class: "reason" },
      h("span", { class: `sev ${SEV_CLASS[sev]}` }, t(`sev.${sev}`)),
      h("span", {}, text, extra, h("span", { class: "reason-code" }, rc))));
  }
  if (r.errors.length) {
    list.append(h("li", { class: "reason" }, h("span", { class: "sev sev-block" }, t("sev.error")),
      h("span", { class: "errors" }, r.errors.join("; "))));
  }
  return h("section", { class: `card route ${ROUTE_CLASS[code] || "r-review"}`, "aria-label": t("routingAria") },
    h("div", { class: "route-side" },
      h("span", { class: "eyebrow" }, t("routeEyebrow"), h("span", { class: "route-code" }, code)),
      h("span", { class: "route-badge" }, title),
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

function problemItem(p) {
  const [code, ...rest] = p.split(":");
  const detail = rest.join(":").trim();
  return h("li", {}, reasonInfo(code)[1], detail ? h("span", { class: "mono" }, ` ${detail}`) : null);
}

function replyCard(r, meta) {
  const d = r.draft;
  const lng = r.classification.language || meta.language;
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
      h("strong", {}, t("declineTitle")),
      h("span", {}, rest ? t("declineRest") : t("declineOnly")),
      h("p", { class: "decline-text", dir: dirFor("", declineText) }, declineText)));
  }

  if (d.abstained) {
    const problems = d.problems.map(problemItem);
    parts.push(h("div", { class: "banner banner-amber", role: "note" },
      h("strong", {}, t("holdingTitle")),
      h("span", {}, t("holdingText")),
      problems.length ? h("ul", {}, problems) : null));
  } else if (d.problems.length) {
    parts.push(h("div", { class: "banner banner-amber", role: "note" },
      h("strong", {}, t("problemsTitle")),
      h("ul", {}, d.problems.map(problemItem))));
  }

  if (d.sentences.length) {
    const facts = d.sentences.filter((s) => s.kind === "fact").length;
    const para = h("p", { class: "sentences", dir, id: "sentences" });
    d.sentences.forEach((s, i) => {
      if (i) para.append(" ");
      const nums = [...new Set(s.chunk_ids.map((id) => cites.get(id)?.n).filter(Boolean))];
      const isFact = s.kind === "fact";
      const label = isFact
        ? t("factCited", { src: nums.map((x) => t("sourceN", { n: x })).join(", ") || t("noSource") })
        : t("kindNoFacts", { kind: tOr(`kind.${s.kind}`, s.kind) });
      para.append(h("span", {
        class: `sent ${isFact ? "sent-fact" : "sent-courtesy"}`,
        "data-chunks": s.chunk_ids.join(" "),
        tabindex: isFact ? "0" : null,
        role: isFact ? "button" : null,
        "aria-label": isFact ? `${s.text}. ${label}` : null,
        title: isFact ? null : label,
      }, s.text, nums.map((x) => h("span", { class: "cite", "aria-hidden": "true" }, String(x)))));
    });
    const cov = tOr(`cov.${d.coverage}`, d.coverage);
    parts.push(h("div", { class: "evidence" },
      h("div", { class: "evidence-head" },
        h("span", { class: "eyebrow" }, t("evidence")),
        h("span", { class: "card-sub", style: "margin:0" },
          `${t("facts", { n: facts })} · ${t("quotesVerified", { v: d.citations_valid, p: d.citations_proposed })} · ${t("coverage", { c: cov })}`),
        h("span", { class: "legend", "aria-hidden": "true" },
          h("span", {}, h("i"), t("citedFact")), h("span", {}, h("i", { class: "c" }), t("courtesy")))),
      para,
      h("p", { class: "stale-note", id: "stale-note", hidden: true }, t("staleNote"))));
  }

  const ta = h("textarea", {
    id: "reply", dir, lang: lng || null, spellcheck: "true", "aria-describedby": "reply-count",
  });
  ta.value = d.reply;
  const count = h("span", { id: "reply-count" }, t("chars", { n: d.reply.length }));
  ta.addEventListener("input", onReplyInput);
  parts.push(h("div", { class: "editor" },
    h("label", { class: "editor-label", for: "reply" }, t("replyLabel"), count), ta));

  const primaryEdit = route === "human_review";
  const playing = !$("#player").paused;
  const sendBtn = h("button", { type: "button", class: `btn ${primaryEdit ? "" : "btn-primary"}`, id: "act-send",
    onclick: () => sendFeedback("sent_as_is") }, t("send"));
  const editBtn = h("button", { type: "button", class: `btn ${primaryEdit ? "btn-primary" : ""}`, id: "act-edit",
    onclick: onEditSend }, t("editSend"));
  parts.push(h("div", { class: "actions" },
    sendBtn, editBtn,
    h("button", { type: "button", class: "btn btn-danger", id: "act-reject", onclick: () => sendFeedback("rejected") }, t("reject")),
    h("span", { class: "spacer" }),
    h("button", { type: "button", class: "btn btn-ghost", id: "act-listen", onclick: onListen }, playing ? t("stop") : t("listen")),
    h("p", { class: "action-msg", id: "action-msg", role: "status", "aria-live": "polite" })));

  const card = h("section", { class: "card reply", "aria-label": t("draftReply") },
    h("div", { class: "card-head" }, h("h2", { class: "card-title" }, t("draftReply")),
      h("span", { class: "card-sub" }, primaryEdit ? t("sub.edit")
        : route === "auto_draft" ? t("sub.auto")
          : declinePlusAnswer(r) ? t("sub.declinePlus") : t("sub.template"))),
    parts);
  wireSentences(card);
  return card;
}

function onReplyInput() {
  const ta = $("#reply");
  if (!ta) return;
  const edited = ta.value !== state.current.original;
  ta.classList.toggle("is-edited", edited);
  $("#reply-count").textContent = `${t("chars", { n: ta.value.length })}${edited ? t("edited") : ""}`;
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
    say("editFirst");
    return;
  }
  sendFeedback("edited");
}

// Status line under the actions. Kept as a key so a language switch can redraw it.
function say(key, vars = {}, kind = "") {
  if (state.current) state.current.said = { key, vars, kind };
  const msg = $("#action-msg");
  if (!msg) return;
  msg.className = `action-msg ${kind}`;
  const v = { ...vars };
  if (v.action) v.a = t(`done.${v.action}`);
  msg.textContent = t(key, v);
}

async function sendFeedback(action) {
  const cur = state.current;
  if (!cur?.result || cur.sent) return;
  const r = cur.result;
  const ta = $("#reply");
  if (action !== "rejected" && !ta.value.trim()) {
    say("replyEmpty", {}, "is-error");
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
    $("#reply").readOnly = true;
    if (cur.meta.sampleId) state.handled.set(cur.meta.sampleId, action);
    await refreshStats();
    const n = state.stats?.total;
    say("logged", { action, n: n ?? "?" }, "is-ok");
    renderInbox();
  } catch (err) {
    ["#act-send", "#act-edit", "#act-reject"].forEach((s) => { $(s).disabled = false; });
    onReplyInput();
    say("logFail", { e: err.message }, "is-error");
  }
}

let audioUrl = null;
const listenBtn = () => $("#act-listen");
async function onListen() {
  const player = $("#player");
  if (!player.paused) {
    player.pause();
    listenBtn().textContent = t("listen");
    return;
  }
  const text = $("#reply").value.trim().slice(0, 2000);
  if (!text) return;
  listenBtn().disabled = true;
  listenBtn().textContent = t("loading");
  try {
    const res = await postJson("/api/tts", { text, language: state.current.result.classification.language || "en" });
    const blob = await res.blob();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = URL.createObjectURL(blob);
    player.src = audioUrl;
    await player.play();
    if (listenBtn()) listenBtn().textContent = t("stop");
    player.onended = () => { if (listenBtn()) listenBtn().textContent = t("listen"); };
  } catch (err) {
    if (listenBtn()) listenBtn().textContent = t("listen");
    say("audioFail", { e: (err.message || t("unsupportedAudio")).replace(/\.+$/, "") }, "is-error");
  } finally {
    if (listenBtn()) listenBtn().disabled = false;
  }
}

// ---------- Audit ----------

function auditBlock(r) {
  const u = r.usage;
  const sha = r.input_sha256;
  const copy = h("button", { type: "button", class: "copy", title: t("copyHash", { h: sha }), onclick: async (e) => {
    try { await navigator.clipboard.writeText(sha); e.currentTarget.textContent = t("copied"); } catch { /* no clipboard */ }
  } }, sha.slice(0, 12));
  const item = (k, v, mono = false) => h("div", {}, h("dt", {}, k),
    h("dd", { class: mono ? "mono" : "", title: typeof v === "string" ? v : null }, v));
  return h("dl", { class: "audit", "aria-label": t("auditAria"), style: "margin:0" },
    item(t("audit.model"), r.model, true),
    item(t("audit.prompt"), r.prompt_version, true),
    item(t("audit.kb"), r.kb_version.slice(0, 12), true),
    item(t("audit.sha"), copy, true),
    item(t("audit.tokens"), `${num(u.input_tokens)} / ${num(u.output_tokens)}`),
    item(t("audit.calls"), String(u.calls)),
    item(t("audit.cost"), `$${num(u.cost_usd, 4)}`),
    item(t("audit.latency"), fmtMs(r.total_latency_ms).join(" ")));
}

// ---------- Sources ----------

function renderSourcesOrError(r) {
  if (state.kbError) {
    $("#sources").replaceChildren(h("p", { class: "muted pad" }, t("loadKbFail", { e: state.kbError })));
    $("#sources-sum").textContent = t("sourcesIntro");
  } else renderSources(r);
}

function renderSources(r) {
  if (state.kbError) { renderSourcesOrError(r); return; }
  const root = $("#sources");
  root.replaceChildren();
  const cites = r ? state.current.cites : new Map();
  const retrieved = new Map((r?.retrieved || []).map((s) => [s.chunk.id, s]));
  let totalChunks = 0;
  // Copies: chunks added below must not leak into state.kb across renders.
  const pages = state.kb.pages.map((kp) => {
    const p = { ...kp, chunks: [...kp.chunks] };
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
  $("#sources-count").textContent = `${t("pages", { n: pages.length })} · ${t("sections", { n: totalChunks })}`;
  $("#sources-sum").textContent = r
    ? (nCited || nGot ? t("sumCited", { c: nCited, g: nGot }) : t("nothingRetrieved"))
    : (state.kb.version ? t("kbSumVersion", { v: state.kb.version.slice(0, 7) }) : t("kbSum"));

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
          btn.textContent = more.hidden ? t("showOther", { n: rest.length }) : t("hideOther");
        } }, t("showOther", { n: rest.length }));
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
    cited ? h("span", { class: "pb pb-cited" }, t("badgeCited", { n: cited })) : null,
    got ? h("span", { class: "pb" }, t("badgeRetrieved", { n: got })) : null,
    !hasResult || (!cited && !got) ? h("span", { class: "pb" }, `${p.chunks.length}`) : null));
  return h("article", { class: `page${cited ? " is-cited" : ""}` },
    h("div", { class: "page-head" }, toggle,
      h("a", { class: "page-link", href: p.url, target: "_blank", rel: "noopener noreferrer",
        title: t("openTitle", { u: p.url }) }, t("open"), h("span", { class: "sr-only" }, t("newTab", { t: p.title })))),
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
  cite ? h("span", { class: "chunk-tag" }, t("chunkCited")) : null,
  !cite && scored ? h("span", { class: "score", title: t("bm25Title") }, `BM25 ${num(scored.score, 2)}`) : null);
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
  const s = c.text.trimStart();
  return s.startsWith(c.heading) ? s.slice(c.heading.length).trimStart() || s : s;
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
  if (!ranges.length) out.push(h("span", { class: "chunk-id", style: "padding:6px 0 0;color:var(--amber-ink)" }, t("quoteNotFound")));
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
      composeMsg("typeFirst", true);
      ta.focus();
      return;
    }
    composeMsg(null);
    runTriage(text, null, { source: "pasted", ticketText: text });
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

  // Click to start, click again to stop and send. A native button click also covers Enter and Space.
  // (Hold-to-record failed: the permission prompt appears on the first press and the release fired first.)
  $("#mic").addEventListener("click", () => {
    if (rec.pending) return;
    if (rec.recorder) stopRec();
    else startRec();
  });
}

function composeMsg(key, error = false) {
  composeState = key ? { key, error } : null;
  const p = $("#compose-msg");
  p.textContent = key ? t(key) : "";
  p.classList.toggle("is-error", Boolean(key) && error);
}

const REC_MAX_MS = 60_000;
const REC_MIN_MS = 500;
// Safari records audio/mp4, Chrome and Firefox webm/ogg. The server accepts .webm .mp3 .wav .m4a .ogg.
const REC_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
const rec = { recorder: null, chunks: [], started: 0, stream: null, pending: false, timer: null };

function recFileName(mime) {
  if (mime.includes("mp4")) return "recording.m4a";
  if (mime.includes("ogg")) return "recording.ogg";
  return "recording.webm";
}

function updateRecLabel() {
  const mic = $("#mic");
  const label = $(".mic-label", mic);
  if (!rec.recorder) {
    label.textContent = t("record");
    mic.removeAttribute("aria-label");
    return;
  }
  const sec = Math.floor((performance.now() - rec.started) / 1000);
  label.textContent = t("recStop", { time: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` });
  mic.setAttribute("aria-label", t("recStopAria"));
}

function setRecUi(on) {
  const mic = $("#mic");
  mic.classList.toggle("is-recording", on);
  mic.setAttribute("aria-pressed", String(on));
  clearInterval(rec.timer);
  rec.timer = on ? setInterval(() => {
    updateRecLabel();
    if (performance.now() - rec.started >= REC_MAX_MS) stopRec();
  }, 250) : null;
  updateRecLabel();
}

async function startRec() {
  if (rec.recorder || rec.pending) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    composeMsg("noRecorder", true);
    return;
  }
  rec.pending = true;
  $("#mic").disabled = true; // until the browser answers the permission prompt
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    composeMsg("micBlocked", true);
    return;
  } finally {
    rec.pending = false;
    $("#mic").disabled = false;
  }
  const type = REC_TYPES.find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
  try {
    rec.recorder = new MediaRecorder(rec.stream, type ? { mimeType: type } : undefined);
  } catch {
    rec.stream.getTracks().forEach((s) => s.stop());
    composeMsg("noRecorder", true);
    return;
  }
  const recorder = rec.recorder;
  rec.chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  recorder.onstop = () => {
    rec.stream.getTracks().forEach((s) => s.stop());
    const ms = performance.now() - rec.started;
    const mime = recorder.mimeType || type || "audio/webm";
    const blob = new Blob(rec.chunks, { type: mime });
    rec.recorder = null;
    setRecUi(false);
    if (ms < REC_MIN_MS || !blob.size) {
      composeMsg("tooShort", true);
      return;
    }
    sendVoice(blob, recFileName(mime));
  };
  rec.started = performance.now();
  recorder.start();
  composeMsg(null);
  setRecUi(true);
}

function stopRec() {
  clearInterval(rec.timer);
  rec.timer = null;
  if (rec.recorder?.state === "recording") rec.recorder.stop();
}

async function sendVoice(blob, name) {
  const seq = ++runSeq;
  state.current = { meta: { source: "voice" }, result: null };
  markCurrentRow();
  showLoading("", { source: "voice" }, "transcribing");
  const fd = new FormData();
  fd.append("audio", blob, name);
  try {
    const res = await api("/api/voice", { method: "POST", body: fd });
    const data = await res.json();
    if (seq !== runSeq) return;
    const text = data.transcript.text;
    showResult(data.result, { source: "voice", ticketText: text, language: data.transcript.language }, data.transcript);
  } catch (err) {
    if (seq !== runSeq) return;
    if (err.status === 401) showError("noToken", "");
    else showError("voiceFail", err.message);
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
  setLang(initialLang(), false);
  wireLang();
  wireCompose();
  wireInboxKeys();
  wireSourcesHover();
  $("#filter").addEventListener("input", renderInbox);
  const [health, samples, kb, stats] = await Promise.allSettled([
    getJson("/api/health"), getJson("/api/samples"), getJson("/api/kb"), getJson("/api/feedback/stats"),
  ]);
  state.health = health.status === "fulfilled" ? health.value : null;
  state.samples = samples.status === "fulfilled" ? samples.value : [];
  state.samplesError = samples.status === "rejected" ? samples.reason.message : null;
  if (kb.status === "fulfilled") state.kb = kb.value;
  else state.kbError = kb.reason.message;
  for (const p of state.kb.pages) for (const c of p.chunks) state.chunks.set(c.id, c);
  state.stats = stats.status === "fulfilled" ? stats.value : null;
  renderStatus();
  renderInbox();
  renderSourcesOrError(null);
  const deep = new URLSearchParams(location.search).get("ticket");
  const s = deep && state.samples.find((x) => x.id === deep);
  if (s) openSample(s);
}

boot();
