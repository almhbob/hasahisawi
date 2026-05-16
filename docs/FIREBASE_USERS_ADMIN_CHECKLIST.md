# Firebase Users Admin Checklist

هدف هذا الفحص: التأكد أن أكثر من 600 مستخدم في Firebase Authentication يمكن مزامنتهم وظهورهم في لوحة الإدارة بدون مشاكل.

## 1) المتغيرات المطلوبة على Render

يجب ضبط هذه المتغيرات في خدمة API:

```bash
DATABASE_URL=postgresql://...
FIREBASE_SERVICE_ACCOUNT_JSON={...}
NODE_ENV=production
```

لا تضع القيم الحقيقية في GitHub.

## 2) فحص صحة الربط

استدعِ:

```text
GET /api/admin/users-source-health
```

يجب أن تكون الاستجابة مثل:

```json
{
  "status": "healthy",
  "firebase_admin_configured": true,
  "firebase_users": 600,
  "postgres_firebase_synced_users": 600,
  "firebase_missing_in_postgres": 0,
  "all_firebase_users_visible_in_admin": true,
  "supports_600_plus_users": true
}
```

إذا كان `status` يساوي `needs_sync` نفّذ خطوة المزامنة.
إذا كان `missing_env` أو `invalid_json` فالمشكلة في متغير `FIREBASE_SERVICE_ACCOUNT_JSON`.

## 3) مزامنة Firebase إلى PostgreSQL

استدعِ:

```text
POST /api/admin/sync-firebase-users
```

المؤشرات المطلوبة:

- `firebase_total` أكبر من أو يساوي 600.
- `errors` يساوي 0.
- `all_firebase_users_visible_in_admin` يساوي true.
- `firebase_synced_after_sync` أكبر من أو يساوي `firebase_total`.

## 4) عرض قائمة الإدارة

استدعِ:

```text
GET /api/admin/users?sync=false&limit=1000&offset=0
```

المؤشرات المطلوبة:

- `total` أكبر من أو يساوي 600.
- `count` يعرض حتى 1000 مستخدم في الصفحة الأولى.
- `sourceTotals.firebase_synced` أكبر من أو يساوي عدد Firebase.
- إذا `pagination.has_more` يساوي true استخدم `next_offset` للصفحة التالية.

## 5) البحث داخل القائمة

استدعِ:

```text
GET /api/admin/users?sync=false&search=example&limit=100
```

يجب أن يبحث في الاسم والبريد والهاتف وFirebase UID.

## 6) أسباب الفشل الشائعة

- `FIREBASE_SERVICE_ACCOUNT_JSON` غير موجود في Render.
- JSON مضاف بعدة أسطر بطريقة لا تقبلها منصة الاستضافة.
- Service Account قديم أو تم إلغاؤه.
- المشروع في JSON لا يطابق مشروع Firebase الذي يحتوي المستخدمين.
- قاعدة البيانات `DATABASE_URL` تشير إلى قاعدة مختلفة عن قاعدة الإنتاج.

## 7) نتيجة النجاح

يعتبر الربط ناجحًا فقط عندما تكون:

```json
{
  "status": "healthy",
  "all_firebase_users_visible_in_admin": true,
  "firebase_missing_in_postgres": 0
}
```
