# إصلاح مشكلة إكمال الملف الشخصي وFirebase

## المشكلة التي ظهرت

ظهرت شاشة الخطأ:

```text
Maximum update depth exceeded
```

السبب هو حلقة تنقّل في `AuthGate`:

1. المستخدم مسجل دخول لكنه لا يملك `gender`.
2. التطبيق يرسله إلى `/complete-profile`.
3. شرط آخر داخل نفس `useEffect` يعيده من `/complete-profile` إلى `/(tabs)/`.
4. تتكرر العملية حتى يوقف React التطبيق برسالة Maximum update depth.

## الإصلاح المطلوب في `app/_layout.tsx`

يجب أن يكون منطق إكمال الملف بهذا الشكل:

```ts
const needsGender = !isGuest && !!user && !user.gender;
if (needsGender) {
  if (!inCompleteProfile) router.replace('/complete-profile' as any);
  return;
}

if (inLogin || inOnboarding || inCompleteProfile) {
  router.replace('/(tabs)/' as any);
}
```

المهم: إذا كان المستخدم داخل `complete-profile` وما زال يحتاج الجنس، يجب أن يبقى فيها ولا يرجع للرئيسية.

## مشكلة إضافية في `auth-context.tsx`

داخل `completeProfile` كان التخزين المحلي يحدث بهذا الشكل:

```ts
{ ...parsed, user: { ...(parsed.user ?? {}), gender } }
```

وهذا غير صحيح لأن `USER_KEY` يخزن المستخدم نفسه مباشرة وليس داخل مفتاح `user`.

الصحيح:

```ts
const updatedUser = user ? { ...user, gender, ...(neighborhood ? { neighborhood } : {}) } : null;
if (updatedUser) {
  setUser(updatedUser);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
}
```

## Firebase

للتأكد أن حسابات Firebase موجودة وتظهر في الإدارة:

1. يجب ضبط `FIREBASE_SERVICE_ACCOUNT_JSON` في Render.
2. افتح:

```text
GET /api/admin/users-source-health
```

المطلوب:

```json
{
  "status": "healthy",
  "firebase_admin_configured": true,
  "firebase_missing_in_postgres": 0,
  "all_firebase_users_visible_in_admin": true
}
```

3. عند الحاجة شغل:

```text
POST /api/admin/sync-firebase-users
```

## ملاحظة تنفيذية

تمت إضافة سكربت إصلاح آلي:

```text
artifacts/hasahisawi/scripts/patch-complete-profile-flow.mjs
```

ويجب تشغيله من مجلد `artifacts/hasahisawi` قبل البناء:

```bash
node scripts/patch-complete-profile-flow.mjs
```

ثم:

```bash
pnpm run build
```
