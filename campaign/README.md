# حملة حصاحيصاوي الإعلانية — أتمتة n8n

حملة نشر مجانية مجدولة لمدة **٢١ يوماً** (تبدأ 2026-11-03) على:
فيسبوك · إنستغرام (صور + Reels) · تيليجرام · إشعارات داخل التطبيق (٧ إشعارات فقط، مرتين أسبوعياً تقريباً).

| الملف | الغرض |
|---|---|
| `calendar.json` | تقويم الحملة: لكل يوم نوع المنشور والملف والنص وإشعار التطبيق (إن وُجد) |
| `media/` | الفيديوهات (9:16) وصور الخدمات (9:16) ونسخ إنستغرام (`ig-*.jpg` بمقاس 4:5) |
| `n8n/hasahisawi-campaign.n8n.json` | الـ workflow الجاهز للاستيراد في n8n |

المواد منشورة تلقائياً على `https://hasahisawi.pages.dev/campaign/...` (عبر Cloudflare Pages Sync).
لتعديل منشور أو تأجيل البداية: عدّل `calendar.json` (مثلاً `start_date`) وادمج إلى master — n8n يقرأه كل يوم.

## التشغيل في n8n Cloud

1. **Workflows → Import from File** واختر `n8n/hasahisawi-campaign.n8n.json`.
2. افتح عقدة **«الإعدادات»** وضع:
   - `page_id` معرّف صفحة فيسبوك.
   - `ig_user_id` معرّف حساب إنستغرام للأعمال المربوط بالصفحة
     (من Graph API Explorer: `GET /{page_id}?fields=instagram_business_account`).
   - `telegram_chat_id` اسم القناة مثل `@hasahisawi` (أو رقمها السالب).
   - يمكن إيقاف أي منصة بـ `enable_*` = false.
3. **بيانات الدخول (Credentials):**
   - **Facebook Graph API** → رمز وصول **الصفحة** طويل الأمد بصلاحيات
     `pages_manage_posts, pages_read_engagement, instagram_basic, instagram_content_publish`.
     اختره في عقد: «نشر على فيسبوك»، «إنستغرام: تجهيز المنشور»، «إنستغرام: نشر».
   - **Telegram** → رمز البوت من @BotFather، وأضف البوت **مشرفاً** في القناة. اختره في عقدتي تيليجرام.
   - **Header Auth** (لعقدة «إشعار لكل مستخدمي التطبيق»):
     Name = `Authorization` ، Value = `Bearer <CAMPAIGN_PUSH_KEY>` (المفتاح محفوظ في Vercel).
4. للتجربة: اجعل `test_day` = 1 واضغط **Execute workflow** (تجربة يدوية)، تأكد من النشر، ثم أعده إلى 0.
5. فعّل الـ workflow (**Active**) — ينشر كل يوم الساعة **7 مساءً بتوقيت الرياض**.

## حماية

- إشعار التطبيق محمي بمفتاح سرّي، وحدّه إشعار حملة واحد كل ٢٠ ساعة مهما تكرر الطلب.
- `GET /api/campaign/status` (بنفس المفتاح) يعرض آخر إشعارات الحملة.
