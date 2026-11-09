# نشر تلقائي: سلسلة «أشياء لا تقال» (٥٠ يوماً)

كل يوم الساعة **9:07 مساءً بتوقيت الرياض** ينشر GitHub Actions (`.github/workflows/campaign-unsaid.yml`)
نص اليوم من `calendar.json` على:

| القناة | الحالة | ما تحتاجه |
|---|---|---|
| **تيك توك** | جديدة | تطبيق مطوّر في TikTok + ربط الحساب مرة واحدة (الخطوات أدناه) |
| فيسبوك / إنستغرام Reels | تعمل مع الحملة الحالية | لا شيء: نفس `FB_PAGE_ID` و`FB_PAGE_TOKEN` و`IG_USER_ID` |
| تيليجرام | تعمل مع الحملة الحالية | لا شيء: نفس `TG_BOT_TOKEN` و`TG_CHAT_ID` |

- الفيديوهات في `media/01.mp4 … 50.mp4`، وتُنشر على `https://hasahisawi.pages.dev/campaign/unsaid/media/` بعد الدمج في master.
- لتغيير تاريخ البداية: عدّل `start_date` في `calendar.json`. اليوم 1 يقابل النص 01.
- لتعديل وصف منشور: عدّل `caption` للنص المطلوب.
- الخادم يمنع تكرار النشر: كل قناة تنشر مرة واحدة لكل نص.

## تفعيل تيك توك (مرة واحدة، ١٥ دقيقة تقريباً)

1. ادخل إلى **https://developers.tiktok.com** بحسابك، ثم **Manage apps → Connect an app**.
   - أضف المنتجين **Login Kit** و**Content Posting API**، وفعّل داخل الثاني **Direct Post**.
   - الصلاحيات (Scopes): `user.info.basic` و`video.publish` و`video.upload`.
   - **Redirect URI**: `https://api-server-gilt-ten.vercel.app/api/tiktok/callback`
   - انسخ **Client key** و**Client secret**.
2. في **Vercel → مشروع api-server → Settings → Environment Variables** أضف:
   - `TIKTOK_CLIENT_KEY`
   - `TIKTOK_CLIENT_SECRET`
   - (اختياري) `TIKTOK_MODE=inbox` لتصل الفيديوهات كمسودات في تطبيق تيك توك، فتضيف صوتاً رائجاً وتنشر بلمسة واحدة.

   بعدها أعد نشر الخادم (Redeploy).
3. افتح هذا الرابط من جوالك وسجّل الدخول بحساب تيك توك الذي تريد النشر عليه، ثم وافق:
   `https://api-server-gilt-ten.vercel.app/api/tiktok/connect?key=<CAMPAIGN_PUSH_KEY>`
   (`CAMPAIGN_PUSH_KEY` محفوظ في متغيرات Vercel). ستظهر لك رسالة «✅ تم ربط حساب تيك توك».
4. للتجربة: من **GitHub → Actions → Things Unsaid series (daily) → Run workflow** اكتب `day = 1` و`only = tiktok`.

### ملاحظة مهمة: مراجعة TikTok

قبل أن تراجع TikTok تطبيقك (Audit)، لا تسمح للتطبيق إلا بالنشر **الخاص (SELF_ONLY)**.
النظام يكتشف ذلك تلقائياً وينشر خاصاً، ويكتب في ملخص الـ workflow: `posted as SELF_ONLY`.
ولتصبح المنشورات عامة: من صفحة التطبيق في developers.tiktok.com اطلب المراجعة (**Submit for review**)
لـ Content Posting API. أو استخدم `TIKTOK_MODE=inbox` في هذه الأثناء.

## المتابعة

- ملخص كل تشغيل يظهر في GitHub Actions.
- `GET /api/campaign/status` و`GET /api/tiktok/status` (بالمفتاح `CAMPAIGN_PUSH_KEY`) يعرضان حالة كل قناة وحالة ربط تيك توك.
