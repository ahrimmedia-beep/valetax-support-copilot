# Voice eval

- Tickets: 8
- Route agreement (text vs voice): 100% (8/8)
- Mean WER: 0.018
- Cost (transcription where reported, plus LLM calls): $0.0941

| id | language | original text | transcript | WER | route text / voice | match |
|---|---|---|---|---|---|---|
| c13 | ru | Сколько времени занимает зачисление депозита? | Сколько времени занимает зачисление депозита? | 0.00 | auto_draft / auto_draft | yes |
| c14 | id | Berapa minimal deposit untuk akun baru? | Berapa minimal deposit untuk akun baru? | 0.00 | auto_draft / auto_draft | yes |
| c15 | hi | मैं अपना ट्रेडिंग खाता कैसे खोलूं? | मैं अपना ट्रेडिंग खाता कैसे खोलूं? | 0.00 | auto_draft / auto_draft | yes |
| c16 | es | ¿Cuánto tarda la verificación de la cuenta? | ¿Cuánto tarda la verificación de la cuenta? | 0.00 | auto_draft / auto_draft | yes |
| h04 | ar | تم رفض طلب السحب الخاص بي، لماذا؟ | تم رفض الطلب السحب الخاص بي، لماذا؟ | 0.14 | human_review / human_review | yes |
| c01 | en | Hi, what is the minimum deposit to start trading with you? | Hi, what is the minimum deposit to start trading with you? | 0.00 | auto_draft / auto_draft | yes |
| c02 | en | How do I withdraw money from my account? | How do I withdraw money from my account? | 0.00 | auto_draft / auto_draft | yes |
| c03 | en | My withdrawal shows status 'pending' since this morning. What does that mean? | My withdrawal shows status pending since this morning. What does that mean? | 0.00 | human_review / human_review | yes |
