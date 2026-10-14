"""Deterministic guardrails. No LLM, no network: plain regular expressions.

They run before the LLM and their verdict can only make routing stricter:
the LLM may add flags of its own, but it can never clear a flag raised here.

Keyword lists cover English plus the languages most common in this broker's support
(Russian, Spanish, Indonesian, Arabic, Hindi/Hinglish). They are starter lists: in
production each list is owned by the support/compliance team and extended from
misses found in the weekly review of agent edits (docs/phase-2.md).

Three entry points:
  scan(text)        -> GuardrailFlags   (input checks)
  redact_pii(text)  -> (text, types)    (before anything is sent to an LLM)
  scan_reply(text)  -> list[problem]    (output checks on LLM-written text)
"""

from __future__ import annotations

import re
from collections.abc import Callable
from re import Pattern

from copilot.models import GuardrailFlags


def _rx(*patterns: str) -> list[Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


TRADING_ADVICE = _rx(
    # English
    r"\bshould i (buy|sell|short|long|go long|go short|enter|exit|hold|invest|open a (buy|sell|long|short))\b",
    r"\bshould i use\b.{0,30}\b(leverage|1:\d+|lot)",
    r"\b(buy|sell|long|short) or (buy|sell|hold|wait|short|long)\b",
    r"\b(which|what) (currency )?(pairs?|stocks?|coins?|crypto|instruments?|assets?|symbols?|commodit(y|ies))\b"
    r".{0,40}\b(buy|sell|trade|invest|best|recommend|profit)",
    r"\b(best|good|right|safest) (time|moment|pairs?|stocks?|coins?|instruments?|strategy|entry|lot size)\b"
    r".{0,30}\b(buy|sell|trade|trading|enter|invest|beginners?|now|today|this week)",
    r"\b(is it|is now|now) (a )?(good|right|smart|bad) (time|moment|idea) to (buy|sell|invest|trade|enter)",
    r"\b(give|send|share|need|want|provide)\b.{0,20}\bsignals?\b",
    r"\bsignals? (for|on)\b",
    r"\b(price target|target price|realistic target)\b",
    r"\b(will|is|are)\b.{0,40}\b(go(ing)? (up|down)|rise|fall|drop|crash|pump|moon)\b",
    r"\b(will|going to) (hit|reach)\s+\$?\d",
    r"\b(what|which|how much) leverage\b.{0,40}\b(should|recommend|best|use|choose|pick|good|safe)",
    r"\b(is|would be)\b.{0,30}\b1:\d{2,4}\b.{0,40}\b(good|safe|ok|okay|right|risky|too (high|much)|better)",
    r"\brecommend\w*\b.{0,30}\b(pairs?|stocks?|coins?|trades?|strategy|leverage|lot size|position|entry)",
    r"\b(pairs?|stocks?|coins?|strategy|leverage|lot size)\b.{0,30}\b(do you |would you )?recommend",
    r"\bhow much should i (invest|trade|risk)\b",
    # Russian
    r"(стоит ли|нужно ли|надо ли|лучше)\s+(сейчас\s+)?(покупать|купить|продавать|продать|входить|заходить|шортить)",
    r"(что|какую|какой|какие)\s+(\w+\s+)?(купить|покупать|продать|торговать)",
    r"какую\s+(валютную\s+)?пару",
    r"сигнал",
    r"куда\s+пойд[её]т",
    r"(вырастет|упад[её]т|рухнет)",
    r"(какое|какое лучше)\s+плечо",
    r"плечо.{0,30}(лучше|посоветуйте|стоит|выбрать|поставить)",
    r"посоветуйте\s+(пару|актив|стратеги|что купить)",
    # Spanish
    r"(debo|debería|deberia|conviene)\s+(comprar|vender|invertir|usar\s+apalancamiento)",
    r"qu[ée]\s+(par|acci[óo]n|moneda)\b.{0,30}(comprar|operar|invertir)",
    r"se[ñn]ales",
    r"(subir[áa]|bajar[áa])\b",
    # Indonesian
    r"(sebaiknya|lebih baik|harus)\s+(beli|jual|buy|sell)",
    r"\bbeli\s+atau\s+jual\b",
    r"\bsinyal\b",
    r"\bpair\s+(apa|mana)\b.{0,30}(bagus|terbaik|beli|untung)",
    # Arabic
    r"(أشتري|اشتري|أبيع|ابيع)",
    r"(أفضل|افضل)\s+(زوج|عملة|سهم)",
    r"(توصيات|توصية|إشارات|اشارات)",
    r"(سيرتفع|سينخفض|سيصعد|سيهبط)",
    r"(الرافعة|رافعة).{0,30}(أفضل|افضل|أنصح|تنصح|مناسبة)",
    # Hindi / Hinglish
    r"(खरीदूं|खरीदना चाहिए|बेचूं|बेचना चाहिए|खरीदें या बेचें)",
    r"(सिग्नल|ट्रेडिंग टिप्स)",
    r"\b(kharid(u|un|na)?|bech(u|un|na)?)\b.{0,20}\b(chahiye|ya)\b",
)

COMPLAINT = _rx(
    r"\b(complain(t|ts|ing)?|unacceptable|ridiculous|disgusting|terrible|worst|useless|scam(mers?)?"
    r"|thie(f|ves)|stole|stealing|rip[- ]?off|refund|chargeback|charge back|dispute|compensat\w*"
    r"|third time|nobody (answers|responds|replies)|no one (answers|responds|replies)|charged twice"
    r"|double charged|disappointed)\b",
    r"(жалоб|претензи|мошенни|развод|обман|верните|украли|ужасн|отвратит|безобрази|никто не отвечает"
    r"|чарджбэк|списали дважды)",
    r"\b(queja|reclamaci[óo]n|reclamo|estafa|reembolso|devu[ée]lvanme)\b",
    r"\b(keluhan|komplain|penipu(an)?|kembalikan uang)\b",
    r"(شكوى|احتيال|نصب|محتال|أعيدوا أموالي|استرداد)",
    r"(शिकायत|धोखा|फ्रॉड|\bshikayat\b|\bdhokha\b)",
)

LEGAL_THREAT = _rx(
    r"\b(lawyers?|attorney|solicitor|sue|suing|lawsuit|legal action|court|regulators?|ombudsman"
    r"|financial commission|police|authorities)\b",
    r"(юрист|адвокат|в суд|судебн|полици|регулятор|прокуратур)",
    r"\b(abogado|demanda|denuncia|tribunal|regulador)\b",
    r"\b(pengacara|polisi|gugat|OJK)\b",
    r"(محامي|محكمة|دعوى|الشرطة|الجهات الرقابية)",
    r"(वकील|अदालत|पुलिस)",
)

FRAUD = _rx(
    r"\b(didn'?t make (this|that|the|these)|did not make|unauthori[sz]ed|hacked|someone (used|accessed|logged)"
    r"|stolen card|not me|identity theft|compromised)\b",
    r"(взлом|не я (делал|совершал)|без моего ведома|украли карт)",
    r"\b(no autoric[ée]|hackearon|me robaron)\b",
    r"\b(diretas|bukan saya|tanpa izin)\b",
    r"(اختراق|لم أقم|بدون إذني)",
    r"(हैक|\bhacked\b)",
)

KYC_AML = _rx(
    r"\b(verification|kyc|documents?|identity check)\b.{0,40}\b(reject\w*|declin\w*|fail\w*|denied|not approved|refused)",
    r"\b(reject\w*|declin\w*|denied|refused)\b.{0,40}\b(verification|kyc|documents?)\b",
    r"\bsource of (funds|wealth|income)\b",
    r"\bproof of income\b",
    r"\b(aml|anti[- ]money laundering|due diligence)\b",
    r"\bcompliance (team|department|check|review|asked|request|officer)",
    r"верификаци.{0,40}(отклон|отказ|не прош)",
    r"(отказали|отклонили)\s.{0,20}верификаци",
    r"(источник\w*\s+(средств|дохода|происхождения)|подтверждени\w+\s+доход|комплаенс)",
    r"verificaci[óo]n.{0,40}(rechaz|deneg)",
    r"origen de (los )?fondos",
    r"verifikasi.{0,30}(ditolak|gagal)",
    r"sumber dana",
    r"(التحقق|التوثيق).{0,30}(رفض|مرفوض)",
    r"مصدر (الأموال|الاموال)",
    r"सत्यापन.{0,30}(अस्वीकार|रिजेक्ट)",
)

ACCOUNT_BLOCKED = _rx(
    r"\b(account|wallet|funds?)\b.{0,30}\b(blocked|frozen|freeze|suspended|disabled|restricted|locked|banned)\b",
    r"\b(blocked|frozen|suspended|locked|banned)\b.{0,20}\baccount\b",
    r"\bcan'?t (log ?in|login|access my account)\b",
    r"(сч[её]т|аккаунт|кабинет).{0,30}(заблокир|заморож|ограничен)",
    r"(заблокир|заморозил).{0,20}(сч[её]т|аккаунт|кабинет)",
    r"не могу войти",
    r"cuenta.{0,30}(bloquead|congelad|suspendid)",
    r"akun.{0,20}(diblokir|dibekukan|ditangguhkan)",
    r"tidak bisa (login|masuk)",
    r"(حسابي|الحساب).{0,30}(محظور|مجمد|موقوف|حظر|تجميد|إيقاف)",
    r"खाता.{0,30}(ब्लॉक|फ्रीज)",
)

MONEY_ISSUE = _rx(
    # The customer cannot get to their money right now. A wrong answer here is the most
    # expensive kind, so these always go to a person even if the KB has a matching FAQ.
    r"\b(withdrawal|withdraw|deposit|payment|transfer|funds|money)\b.{0,40}\b(rejected|declined|failed"
    r"|cancell?ed|not (been )?(received|credited|arrived|showing|reflected)|still pending|missing"
    r"|hasn'?t (arrived|updated|been credited)|has not (arrived|updated|been credited))",
    r"\b(haven'?t|have not|didn'?t|did not|not yet|still not) (received|got|get|been credited)\b",
    r"\bstill (hasn'?t|has not|not) (updated|arrived|been credited|come)\b",
    r"\bpending for \d+ (days?|hours?|weeks?)\b",
    r"(вывод|депозит|пополнени|деньги|средства|перевод).{0,40}(отклон|не пришл|не поступ|не зачисл|завис)",
    r"(retiro|dep[óo]sito).{0,30}(rechazad|no (ha )?llegado|pendiente)",
    r"(penarikan|dana)\b.{0,30}(ditolak|belum masuk|belum diterima)",
    r"deposit\b.{0,30}(ditolak|belum masuk)",
    r"(رفض طلب السحب|رفض السحب|لم يصل|لم تصل|لم يتم إيداع)",
    r"(निकासी|जमा|पैसे).{0,30}(अस्वीकार|नहीं मिल|नहीं आए)",
)

PROMPT_INJECTION = _rx(
    r"\b(ignore|disregard|forget)\b.{0,30}\b(instructions|rules|prompts?|guidelines|polic(y|ies))\b",
    r"\bsystem prompt\b",
    r"\byou are now\b",
    r"\b(pretend (to be|you are)|act as an?|developer mode|jailbreak)\b",
    r"\bnew instructions\s*:",
    r"(игнорируй|забудь).{0,30}(правила|инструкции)",
    r"ты теперь",
    r"ignora\s+(tus|las|todas)\s+.{0,20}(reglas|instrucciones)",
)


def _matches(patterns: list[Pattern[str]], text: str) -> list[str]:
    found: list[str] = []
    for p in patterns:
        m = p.search(text)
        if m and m.group(0) not in found:
            found.append(m.group(0))
    return found


# --- PII ---------------------------------------------------------------------------------

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
IBAN = re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b")
CARD_CANDIDATE = re.compile(r"\b(?:\d[ -]?){12,18}\d\b")
PHONE = re.compile(r"(?<!\w)\+?\d[\d ()-]{8,}\d(?!\w)")


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def redact_pii(text: str) -> tuple[str, list[str]]:
    """Replace e-mails, card numbers, IBANs and phone numbers with placeholders.

    Runs before any text leaves our process. The agent still sees the original ticket.
    """
    types: list[str] = []

    def card(m: re.Match[str]) -> str:
        digits = re.sub(r"\D", "", m.group(0))
        if 13 <= len(digits) <= 19 and _luhn_ok(digits):
            types.append("card")
            return "[CARD]"
        return m.group(0)

    def placeholder(kind: str) -> Callable[[re.Match[str]], str]:
        def sub(_: re.Match[str]) -> str:
            types.append(kind)
            return f"[{kind.upper()}]"

        return sub

    out = EMAIL.sub(placeholder("email"), text)
    out = IBAN.sub(placeholder("iban"), out)
    out = CARD_CANDIDATE.sub(card, out)
    out = PHONE.sub(placeholder("phone"), out)
    return out, sorted(set(types))


def scan(text: str) -> GuardrailFlags:
    _, pii = redact_pii(text)
    return GuardrailFlags(
        trading_advice=_matches(TRADING_ADVICE, text),
        complaint=_matches(COMPLAINT, text),
        kyc_aml=_matches(KYC_AML, text),
        account_blocked=_matches(ACCOUNT_BLOCKED, text),
        legal_threat=_matches(LEGAL_THREAT, text),
        fraud=_matches(FRAUD, text),
        money_issue=_matches(MONEY_ISSUE, text),
        prompt_injection=_matches(PROMPT_INJECTION, text),
        pii_types=pii,
    )


# --- Specific terms ---------------------------------------------------------------------
# Named things a customer asks about and a model likes to invent: documents, payment
# methods, platforms, fees, limits, bonuses, regulation. Used in two directions (draft.py):
#   * a term in the reply that is in neither the cited KB text nor the ticket -> invented;
#   * a term in the ticket that the cited KB text never mentions -> the KB cannot answer
#     that part, so the draft is at best partial.
# Like the keyword lists above, this is owned by the support team and grows from reviews.

SPECIFIC_TERMS: dict[str, Pattern[str]] = {
    name: re.compile(p, re.IGNORECASE)
    for name, p in {
        "passport": r"passport|паспорт|pasaporte|paspor|جواز|पासपोर्ट",
        "driving licence": r"driv\w* licen[cs]e|driver'?s licen[cs]e|водительск|licencia de conducir|رخصة القيادة|ड्राइविंग लाइसेंस",
        "national id": r"national id|id card|identity card|удостоверение личности|\bdni\b|\bktp\b|بطاقة الهوية|aadhaar|आधार",
        "selfie": r"selfie|селфи",
        "bank card": r"\bvisa\b|mastercard|credit card|debit card|bank card|банковск\w* карт|tarjeta de cr[ée]dito|kartu kredit",
        "skrill": r"skrill",
        "neteller": r"neteller",
        "perfect money": r"perfect ?money",
        "paypal": r"paypal",
        "upi": r"\bupi\b",
        "e-wallet": r"e-?wallet|электронн\w* кошел",
        "usdt": r"\busdt\b|tether",
        "crypto network": r"\b(trc|erc|bep)-?20\b",
        "bitcoin": r"bitcoin|\bbtc\b|биткоин",
        "crypto": r"\bcrypto|криптовалют",
        "bank wire": r"wire transfer|bank wire|\bswift\b|банковский перевод|transferencia bancaria",
        "metatrader": r"\bmt[45]\b|metatrader",
        "fee": r"\bfees?\b|\bcommissions?\b|комисси|comisi[óo]n|\bbiaya\b|رسوم|शुल्क",
        "limit": r"\blimits?\b|лимит|l[íi]mite|\bbatas\b",
        "bonus": r"\bbonus|бонус|\bbono\b",
        "refund": r"refund|reimburs|compensat|возврат|компенсац|reembols|pengembalian dana|استرداد|تعويض",
        "regulation": r"regulat\w*|\bfca\b|cysec|\basic\b|регулятор|регулир",
    }.items()
}


def specific_terms(text: str) -> set[str]:
    return {name for name, p in SPECIFIC_TERMS.items() if p.search(text)}


# --- Courtesy sentences -----------------------------------------------------------------
# A greeting, closing or handoff needs no source, so it must not carry a fact: no timeline
# ("within two days", "instantly"), no price ("free of charge") and no promise. Kept apart
# from SPECIFIC_TERMS so the ticket-side `partial` logic does not change. Over-matching only
# turns a draft into a holding reply (fails closed); the fixed texts in templates.py must pass.

_HI_EDGE_L = r"(?:^|(?<=[\s,.।]))"  # Devanagari vowel signs break \b, so use whitespace edges
_HI_EDGE_R = r"(?=$|[\s,.।])"

COURTESY_FORBIDDEN = _rx(
    # English
    r"\bwithin\b|\binstant\w*|\bimmediately\b|\btoday\b|\btomorrow\b|\bsame[- ]day\b",
    r"\b(minutes?|hours?|days?|weeks?|months?)\b",
    r"(?<!feel )\bfree\b|\bno (charges?|costs?|fees?)\b|\bguarantee\w*",
    r"\b(one(?!\s+of\b)|two|three|four|five|six|seven|eight|nine|ten)\b",
    # Russian
    r"мгновенн|\bсразу\b|сегодня|завтра|в течение|\bчас(а|ов)?\b|\b(день|дня|дней)\b|рабоч"
    r"|\bминут|\bнедел|\bмесяц|бесплатн|без комисси|гарантир",
    # Spanish
    r"\binmediat\w*|\bhoy\b|\bmañana\b|\bdentro de\b|\bhoras?\b|\bd[ií]as?\b|\bminutos?\b"
    r"|\bsemanas?\b|\bgratis\b|\bsin (comisi[oó]n|costo|cargo)\b|\bgaranti\w*",
    # Indonesian
    r"\bsegera\b|\bhari ini\b|\bbesok\b|\bdalam waktu\b|\bjam\b|\bhari\b|\bmenit\b"
    r"|\bminggu\b|\bgratis\b|\btanpa biaya\b|\bdijamin\b",
    # Arabic
    r"فور[اًا]|فوري|اليوم|غد[اًا]?\b|خلال|ساع[ةات]|يوم|أيام|مجان|نضمن|مضمون",
    # Hindi
    r"तुरंत|मुफ्त|मुफ़्त|गारंटी|" + _HI_EDGE_L + r"(आज|कल|घंटे|घंटों|दिन|दिनों)" + _HI_EDGE_R,
)


# Fixed courtesy phrases that contain a time word but state no fact ("Have a nice day").
# They are removed before COURTESY_FORBIDDEN runs, so "today" elsewhere in the same sentence
# ("credited today") is still caught.
COURTESY_ALLOWED = _rx(
    r"\b(nice|great|good|wonderful|lovely) day\b",
    r"\b(contacting|reaching out to) us today\b",
    r"\bhelp you today\b",
    r"хорошего (дня|вечера)",
    r"\bbuen(os)? d[ií]as?\b",
    r"\bsemoga hari\b",
    r"طاب يومك|يوم[اًا]+ سعيد[اًا]*",
    r"दिन शुभ",
)


def courtesy_violations(text: str) -> list[str]:
    """Timeline, price or promise words found in a sentence that claims to be a courtesy."""
    for p in COURTESY_ALLOWED:
        text = p.sub(" ", text)
    return _matches(COURTESY_FORBIDDEN, text)


# --- Output checks on LLM-written text ----------------------------------------------------

ADVICE_IN_REPLY = _rx(
    r"\b(i|we) (would )?(recommend|suggest|advise)( that)?( you)?( to)? "
    r"(buy|sell|go long|go short|trade|use|choose|pick|open|enter|start with)\b",
    r"\byou should (buy|sell|go long|go short|use\b.{0,20}\bleverage|trade|invest|enter)",
    r"\b(good|great|right|best) (time|moment|idea) to (buy|sell|trade|enter|invest)",
    r"\b(likely|expected) to (rise|fall|go up|go down|reach|hit)\b",
    r"\b(bullish|bearish)\b",
    r"\bprice target\b",
    r"(рекомендую|советую)\s+(купить|продать|использовать|выбрать|торговать)",
    r"стоит\s+(купить|продать)",
)

OUTCOME_PROMISE = _rx(
    r"\byour (account|verification|withdrawal|deposit|refund|documents?|complaint)\b.{0,20}"
    r"\b(has been|is|will be)\b.{0,10}\b(approved|unblocked|unlocked|reinstated|refunded|resolved)\b",
    r"\bwe (will|'ll|can) (refund|compensate|reimburse|unblock|unlock|approve|reverse)\b",
    r"\b(will|won'?t|will not|would not|wouldn'?t) be (closed|terminated|suspended|blocked|frozen)\b",
    r"\bguarantee",
    r"(будет|был[аио]?)\s+(одобрен|разблокирован|возвращен)",
    r"мы (вернем|вернём|компенсируем|разблокируем)",
)


_CONDITIONAL = re.compile(r"\b(once|when|after|if|until|as soon as)\W+$", re.IGNORECASE)


def _promises(text: str) -> list[str]:
    """Outcome statements, ignoring conditional ones ("once your withdrawal is approved, ...")."""
    found: list[str] = []
    for p in OUTCOME_PROMISE:
        for m in p.finditer(text):
            if not _CONDITIONAL.search(text[max(0, m.start() - 20) : m.start()]):
                found.append(m.group(0))
                break
    return found


def scan_reply(text: str) -> list[str]:
    """Problems found in an LLM-written reply. Any problem -> the draft is not used."""
    problems = [f"advice_in_reply: {m}" for m in _matches(ADVICE_IN_REPLY, text)]
    problems += [f"outcome_promise: {m}" for m in _promises(text)]
    return problems
