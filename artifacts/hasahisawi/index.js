// نقطة دخول التطبيق.
// تُسجَّل معالجات المكالمات الواردة (مهمة الخلفية + أزرار الإشعار) قبل تحميل
// expo-router حتى تعمل والتطبيق مغلق (Android يشغّل الحزمة دون واجهة).
import "./lib/desktop-web-boot";
import "./lib/incoming-call-boot";
import "expo-router/entry";
