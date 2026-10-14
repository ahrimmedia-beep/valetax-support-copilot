"""Fixed texts the co-pilot uses instead of LLM output.

They are deliberately static: a decline of trading advice and a holding reply must say the
same thing every time, contain no numbers or promises, and be approved once by compliance.
Translations are a starting point and should be checked by native-speaking agents.
Unknown languages fall back to English.
"""

from __future__ import annotations

DECLINE_TRADING_ADVICE: dict[str, str] = {
    "en": (
        "Thank you for your message. We are not able to provide trading or investment advice, "
        "such as which instruments to trade, when to enter or exit the market, where prices may "
        "go, or which leverage to use. These decisions depend on your own judgement and risk "
        "tolerance. Trading CFDs involves a high level of risk, so please read our Risk "
        "Disclosures before trading. If you have a question about your account, deposits or "
        "withdrawals, we will be glad to help."
    ),
    "ru": (
        "Спасибо за обращение. Мы не можем давать торговые или инвестиционные рекомендации: "
        "какими инструментами торговать, когда входить в рынок или выходить из него, куда может "
        "пойти цена или какое кредитное плечо использовать. Эти решения зависят от вашей "
        "собственной оценки и готовности к риску. Торговля CFD связана с высоким риском, "
        "пожалуйста, ознакомьтесь с нашим Уведомлением о рисках. Если у вас есть вопрос по "
        "счёту, пополнению или выводу средств, мы с радостью поможем."
    ),
    "es": (
        "Gracias por su mensaje. No podemos ofrecer asesoramiento de trading o de inversión, "
        "como qué instrumentos operar, cuándo entrar o salir del mercado, hacia dónde pueden ir "
        "los precios o qué apalancamiento usar. Estas decisiones dependen de su propio criterio "
        "y tolerancia al riesgo. Operar con CFD conlleva un alto nivel de riesgo; lea nuestra "
        "Divulgación de Riesgos antes de operar. Si tiene alguna pregunta sobre su cuenta, "
        "depósitos o retiros, estaremos encantados de ayudarle."
    ),
    "id": (
        "Terima kasih atas pesan Anda. Kami tidak dapat memberikan saran trading atau investasi, "
        "seperti instrumen apa yang ditradingkan, kapan masuk atau keluar dari pasar, ke mana arah "
        "harga, atau leverage apa yang digunakan. Keputusan ini bergantung pada penilaian dan "
        "toleransi risiko Anda sendiri. Trading CFD memiliki risiko tinggi, mohon baca "
        "Pengungkapan Risiko kami sebelum trading. Jika Anda memiliki pertanyaan tentang akun, "
        "deposit, atau penarikan, kami siap membantu."
    ),
    "ar": (
        "شكرًا لرسالتك. لا يمكننا تقديم نصائح تداول أو استثمار، مثل الأدوات التي يجب تداولها، "
        "أو متى تدخل السوق أو تخرج منه، أو اتجاه الأسعار، أو الرافعة المالية التي يجب استخدامها. "
        "تعتمد هذه القرارات على تقديرك الشخصي ومدى تحملك للمخاطر. ينطوي تداول عقود الفروقات على "
        "مستوى عالٍ من المخاطر، لذا يرجى قراءة إفصاح المخاطر لدينا قبل التداول. إذا كان لديك سؤال "
        "حول حسابك أو الإيداع أو السحب، يسعدنا مساعدتك."
    ),
    "hi": (
        "आपके संदेश के लिए धन्यवाद। हम ट्रेडिंग या निवेश सलाह नहीं दे सकते, जैसे किन "
        "इंस्ट्रूमेंट्स में ट्रेड करें, बाज़ार में कब प्रवेश करें या बाहर निकलें, कीमतें किस दिशा में "
        "जा सकती हैं, या कौन सा लीवरेज इस्तेमाल करें। ये निर्णय आपके अपने आकलन और जोखिम "
        "सहनशीलता पर निर्भर करते हैं। CFD ट्रेडिंग में उच्च जोखिम होता है, कृपया ट्रेडिंग से पहले "
        "हमारा जोखिम प्रकटीकरण पढ़ें। यदि आपके खाते, जमा या निकासी के बारे में कोई प्रश्न है, तो "
        "हमें मदद करके खुशी होगी।"
    ),
}

HOLDING_REPLY: dict[str, str] = {
    "en": (
        "Thank you for contacting us. We have received your request, and a member of our support "
        "team will review it and get back to you as soon as possible."
    ),
    "ru": (
        "Спасибо за обращение. Мы получили ваш запрос, специалист службы поддержки рассмотрит "
        "его и свяжется с вами в ближайшее время."
    ),
    "es": (
        "Gracias por contactarnos. Hemos recibido su solicitud y un miembro de nuestro equipo de "
        "soporte la revisará y le responderá lo antes posible."
    ),
    "id": (
        "Terima kasih telah menghubungi kami. Permintaan Anda telah kami terima, dan tim dukungan "
        "kami akan meninjaunya serta menghubungi Anda sesegera mungkin."
    ),
    "ar": (
        "شكرًا لتواصلك معنا. لقد استلمنا طلبك، وسيقوم أحد أعضاء فريق الدعم بمراجعته والرد عليك "
        "في أقرب وقت ممكن."
    ),
    "hi": (
        "हमसे संपर्क करने के लिए धन्यवाद। हमें आपका अनुरोध मिल गया है, और हमारी सहायता टीम का "
        "एक सदस्य इसकी समीक्षा करके जल्द से जल्द आपसे संपर्क करेगा।"
    ),
}


def decline_trading_advice(language: str) -> str:
    return DECLINE_TRADING_ADVICE.get(language, DECLINE_TRADING_ADVICE["en"])


def holding_reply(language: str) -> str:
    return HOLDING_REPLY.get(language, HOLDING_REPLY["en"])
