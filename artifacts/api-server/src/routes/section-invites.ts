// ════════════════════════════════════════════════════════════════
// ✉️ «دعوات الأقسام» — روابط دعوة رسمية لكل قسم، ينشئها مدير التطبيق وحده
//  • المدير يختار القسم ويكتب اسم المدعو (شخص/جهة) ورسالة شخصية ومدة الصلاحية وعدد الاستخدامات.
//  • لكل دعوة رمز عشوائي، وصفحة عامة أنيقة (Open Graph) تظهر معاينتها في واتساب وفيسبوك.
//  • المدعو يفتح الرابط ← يقبل الدعوة (بعد تسجيل الدخول) ← ينتقل مباشرةً لشاشة الانضمام للقسم.
//  • تُحتسب الفتحات (مرة لكل جهاز يومياً) والقبولات، ويمكن إلغاء الدعوة أو تمديدها.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomInt, createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");
const WEB_APP = (process.env.APP_URL || "https://hasahisawi.pages.dev").replace(/\/$/, "");
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.almhbob.hasahisawi";
const INVITER = "إدارة حصاحيصاوي";
const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SectionGroup = "general" | "health" | "commerce" | "education" | "community" | "professional";
export const GROUP_TITLES: Record<SectionGroup, string> = {
  general: "عام", health: "الصحة والإسعاف", commerce: "التجارة والخدمات",
  education: "التعليم والثقافة", community: "المجتمع والمنظمات", professional: "المهن والإعلانات",
};

export type SectionDef = {
  title: string; tagline: string; icon: string; emoji: string; color: string;
  route: string; params?: Record<string, string>;
  group: SectionGroup;
  /** ما يُقدَّم للمدعو بعبارة واحدة مباشرة (دعوة الأفراد) */
  pitch: string;
  /** ما تُدعى إليه الجهة رسمياً (دعوة الجهات) */
  orgPitch: string;
  /** فوائد ملموسة يجدها المنضم فعلاً في القسم (2–3 بنود قصيرة) */
  benefits: string[];
};

// مسارات الانضمام الفعلية داخل التطبيق (تم التحقق من وجود كل شاشة ونموذج التسجيل فيها)
export const SECTIONS: Record<string, SectionDef> = {
  // ── عام ──
  app: { group: "general", title: "الانضمام إلى حصاحيصاوي", tagline: "خدمات مدينة الحصاحيصا في مكان واحد", icon: "sparkles", emoji: "💚", color: "#00966A", route: "/(tabs)",
    pitch: "حمّل تطبيق حصاحيصاوي لتصل إلى خدمات المدينة وأخبارها من هاتفك",
    orgPitch: "الانضمام إلى منصة حصاحيصاوي والتواصل المباشر مع أهل المدينة",
    benefits: ["مواقيت الصلاة والأخبار والتنبيهات العاجلة", "الطبيب والمحامي والسوق والوظائف في تطبيق واحد", "مراسلة ومكالمات مجانية داخل التطبيق"] },
  partnership: { group: "general", title: "الشراكات الخارجية", tagline: "شراكات الشركات والجهات", icon: "globe", emoji: "🌍", color: "#E8A900", route: "/external-partnership",
    pitch: "قدّم طلب شراكة مع حصاحيصاوي باسم جهتك",
    orgPitch: "بناء شراكة رسمية بين جهتكم ومنصة حصاحيصاوي",
    benefits: ["الوصول إلى مستخدمي المنصة في الحصاحيصا", "صفحة تعريفية بالجهة وخدماتها", "تنسيق مباشر مع إدارة المنصة"] },

  // ── الصحة والإسعاف ──
  medical: { group: "health", title: "المنشآت الطبية", tagline: "مستشفيات، عيادات، صيدليات، مختبرات", icon: "medkit", emoji: "🏥", color: "#E05567", route: "/org-join",
    pitch: "سجّل منشأتك الطبية ليجدها المرضى ويحجزوا مواعيدهم معك",
    orgPitch: "تسجيل منشأتكم الطبية في قسم الطب والصحة بتوثيق رسمي",
    benefits: ["صفحة موثّقة بالأقسام والأطباء ومواعيد العمل", "حجز المواعيد إلكترونياً وإلغاؤها بأسباب", "ظهور في دليل المنشآت والطوارئ"] },
  medical_staff: { group: "health", title: "الأطباء والكوادر الطبية", tagline: "أطباء، ممرضون، صيادلة، فنيون", icon: "pulse", emoji: "🩺", color: "#DB2777", route: "/staff-portal",
    pitch: "سجّل نفسك ضمن الكوادر الطبية ليصل إليك المرضى ويحجزوا معك",
    orgPitch: "تسجيل كوادركم الطبية في دليل الأطباء والكوادر",
    benefits: ["ملف مهني بالتخصص ومكان العمل", "استقبال طلبات الحجز وإدارة المواعيد", "إصدار الإجازات المرضية إلكترونياً"] },
  red_crescent: { group: "health", title: "الهلال الأحمر السوداني", tagline: "متطوعون ومسعفون", icon: "medkit", emoji: "⛑️", color: "#B91C1C", route: "/red-crescent",
    pitch: "انضم إلى فريق الهلال الأحمر السوداني بالحصاحيصا متطوعاً أو مسعفاً",
    orgPitch: "تفعيل مساحتكم الرسمية لإدارة وحدات الجمعية ومتطوعيها",
    benefits: ["مدير لكل وحدة يدير بياناتها وحدها", "بطاقة مسعف رقمية يُتحقق منها برمز QR", "الدورات والشهادات والاجتماعات وإشعار الأعضاء"] },

  // ── التجارة والخدمات ──
  stores: { group: "commerce", title: "متاجر المجتمع", tagline: "متجر إلكتروني وطلبات مباشرة", icon: "bag-handle", emoji: "🛍️", color: "#E8A900", route: "/store-portal",
    pitch: "افتح متجرك على حصاحيصاوي واستقبل الطلبات من زبائن المدينة",
    orgPitch: "فتح متجركم الإلكتروني على منصة حصاحيصاوي",
    benefits: ["عرض المنتجات بالصور والأسعار", "طلبات مباشرة مع التوصيل أو الاستلام", "لوحة إعدادات للمتجر وطرق الدفع"] },
  boutiques: { group: "commerce", title: "المتاجر والبوتيكات", tagline: "واجهة عرض للأزياء والإكسسوارات", icon: "shirt", emoji: "👗", color: "#C026D3", route: "/(tabs)/product-showcase",
    pitch: "اعرض منتجات بوتيكك في سوق المتاجر والبوتيكات",
    orgPitch: "عرض منتجات متجركم في سوق المتاجر والبوتيكات",
    benefits: ["واجهة عرض بصور المنتجات", "تواصل مباشر مع الزبائن", "ظهور ضمن متاجر المدينة"] },
  market: { group: "commerce", title: "السوق والمحلات التجارية", tagline: "بيع وشراء ومحلات الهواتف", icon: "cart", emoji: "🛒", color: "#16A34A", route: "/(tabs)/market",
    pitch: "سجّل محلك التجاري في سوق حصاحيصاوي وانشر بضاعتك",
    orgPitch: "تسجيل محلكم التجاري في سوق حصاحيصاوي",
    benefits: ["نشر المنتجات بالصور والأسعار", "صفحة للمحل بالعنوان ووسائل التواصل", "وصول إلى مشترين من داخل المدينة"] },
  restaurants: { group: "commerce", title: "المطاعم والكافيهات", tagline: "قائمة طعام وطلبات توصيل", icon: "restaurant", emoji: "🍽️", color: "#F97316", route: "/(tabs)/restaurants",
    pitch: "أضف مطعمك ليطّلع الزبائن على قائمتك ويطلبوا منك",
    orgPitch: "إضافة مطعمكم إلى قسم المطاعم والكافيهات",
    benefits: ["قائمة طعام بالصور والأسعار", "استقبال الطلبات وإصدار الفواتير", "تقييمات الزبائن وظهور في دليل المطاعم"] },
  designers: { group: "commerce", title: "المصممون", tagline: "معرض أعمال وطلبات تصميم", icon: "color-palette", emoji: "🎨", color: "#3B78A6", route: "/designer-portal",
    pitch: "اعرض أعمالك في معرض التصاميم واستقبل طلبات العملاء",
    orgPitch: "عرض أعمال مكتبكم في معرض التصاميم",
    benefits: ["معرض أعمال بصفحة خاصة", "استقبال طلبات التصميم مباشرة", "بوابة لإدارة الأعمال والمنتجات"] },
  drivers: { group: "commerce", title: "سائقو «مشوارك علينا»", tagline: "مشاوير وخدمات توصيل داخل المدينة", icon: "car", emoji: "🚗", color: "#F97316", route: "/(tabs)/transport",
    pitch: "انضم إلى سائقي «مشوارك علينا» واستقبل طلبات المشاوير في المدينة",
    orgPitch: "تسجيل أسطولكم في خدمة «مشوارك علينا»",
    benefits: ["طلبات مشاوير من داخل الحصاحيصا", "أوقات عمل يحددها السائق بنفسه", "تقييمات الركاب تبني السمعة"] },
  travel: { group: "commerce", title: "وكالات السفر", tagline: "رحلات وتذاكر بين المدن", icon: "airplane", emoji: "✈️", color: "#0EA5E9", route: "/travel-agencies",
    pitch: "سجّل وكالتك لعرض رحلاتها وبيع تذاكرها عبر التطبيق",
    orgPitch: "تسجيل وكالتكم في قسم السفر وعرض رحلاتها",
    benefits: ["عرض الرحلات والمواعيد والعروض", "حجوزات مباشرة بتذاكر رقمية", "بوابة لإدارة الرحلات والركاب"] },
  occasions: { group: "commerce", title: "المناسبات", tagline: "صالات، كوشات، تصوير، سيارات أفراح", icon: "gift", emoji: "🎉", color: "#D97706", route: "/(tabs)/occasions",
    pitch: "اعرض خدماتك في قسم المناسبات ليصل إليك أصحاب الأفراح",
    orgPitch: "عرض خدماتكم في قسم المناسبات",
    benefits: ["صفحة بصور الأعمال والأسعار", "طلبات حجز مباشرة", "ظهور عند البحث عن خدمات الأفراح"] },
  women: { group: "commerce", title: "قسم المرأة", tagline: "خدمات ومشاريع نسائية", icon: "flower", emoji: "🌸", color: "#5B8DB8", route: "/(tabs)/women",
    pitch: "اعرضي خدمتكِ أو مشروعكِ في قسم المرأة",
    orgPitch: "عرض خدمات جهتكم في قسم المرأة",
    benefits: ["صفحة للمشروع بالصور والتفاصيل", "تواصل مباشر مع العميلات", "مساحة آمنة تراجعها الإدارة"] },
  men: { group: "commerce", title: "قسم الرجال", tagline: "الحلاقة والأزياء والحِرف", icon: "man", emoji: "🧔", color: "#38BDF8", route: "/(tabs)/men",
    pitch: "سجّل خدمتك في قسم الرجال وصِل إلى زبائن جدد",
    orgPitch: "تسجيل خدمات جهتكم في قسم الرجال",
    benefits: ["صفحة بالخدمات وأوقات العمل", "حجوزات وطلبات مباشرة", "ظهور ضمن دليل الخدمات"] },
  rental: { group: "commerce", title: "التأجير والعقارات", tagline: "منازل، محلات، معدات، سيارات", icon: "key", emoji: "🔑", color: "#0891B2", route: "/(tabs)/rental",
    pitch: "اعرض عقارك أو معداتك للإيجار ووثّق العقد مع المستأجر في التطبيق",
    orgPitch: "عرض عقاراتكم ومعداتكم في قسم التأجير",
    benefits: ["إعلان بالصور والسعر والموقع", "عقد إيجار رقمي يوقّعه الطرفان", "التطبيق شاهد موثّق عند النزاع"] },
  telecom: { group: "commerce", title: "شركات الاتصالات", tagline: "باقات وعروض وخدمات المشتركين", icon: "cellular", emoji: "📶", color: "#7C3AED", route: "/(tabs)/telecom",
    pitch: "اعرض باقات شركتك وعروضها لمشتركي الحصاحيصا",
    orgPitch: "عرض باقات شركتكم وخدماتها في قسم الاتصالات",
    benefits: ["صفحة للشركة بالباقات والعروض", "إعلان الفعاليات والعروض الموسمية", "وصول إلى مستخدمي المدينة"] },
  factories: { group: "commerce", title: "المصانع والإنتاج المحلي", tagline: "عرض المنتجات المحلية", icon: "hardware-chip", emoji: "🏭", color: "#F97316", route: "/(tabs)/factories",
    pitch: "اعرض منتجات مصنعك في قسم الإنتاج المحلي",
    orgPitch: "عرض منتجات مصنعكم في قسم المصانع والإنتاج المحلي",
    benefits: ["صفحة للمصنع ومنتجاته", "طلبات التجار والجمهور مباشرة", "تعريف أهل المدينة بالمنتج المحلي"] },
  farmers: { group: "commerce", title: "المزارعون والمنتجون", tagline: "محاصيل ومنتجات زراعية", icon: "leaf", emoji: "🌾", color: "#65A30D", route: "/(tabs)/farmers",
    pitch: "أضف محاصيلك ومنتجاتك ليشتري منك التجار والأسر مباشرة",
    orgPitch: "عرض منتجات جمعيتكم الزراعية في قسم المزارعين",
    benefits: ["عرض المحصول بالكمية والسعر", "بيع مباشر دون وسيط", "تواصل مع تجار المدينة"] },
  contractors: { group: "commerce", title: "شركات المقاولات", tagline: "معرض مشاريع وطلبات عروض أسعار", icon: "construct", emoji: "🏗️", color: "#B45309", route: "/contractors", params: { tab: "register" },
    pitch: "سجّل شركتك في دليل المقاولين واستقبل طلبات عروض الأسعار",
    orgPitch: "تسجيل شركتكم في دليل شركات المقاولات",
    benefits: ["معرض مشاريع بصور قبل وبعد", "طلبات عروض أسعار وعقود رقمية", "توظيف العمال من داخل التطبيق"] },

  // ── التعليم والثقافة ──
  universities: { group: "education", title: "الجامعات والكليات", tagline: "إدارة أكاديمية رقمية للطلاب والأساتذة", icon: "library", emoji: "🏛️", color: "#1E3A8A", route: "/edu-institution", params: { join: "1" },
    pitch: "فعّل بوابة جامعتك الأكاديمية على حصاحيصاوي",
    orgPitch: "تفعيل بوابتكم الأكاديمية لإدارة الأقسام والأساتذة والطلاب",
    benefits: ["جداول محاضرات ترفض التضارب تلقائياً", "النتائج والحضور وطلبات الطلاب إلكترونياً", "إعلانات تصل إلى الطلاب بإشعار فوري"] },
  education: { group: "education", title: "المدارس والمعاهد", tagline: "مدارس، معاهد، رياض أطفال", icon: "school", emoji: "🎓", color: "#0F766E", route: "/edu-institution", params: { join: "1" },
    pitch: "سجّل مدرستك لإدارة الطلاب والجداول والتواصل مع أولياء الأمور",
    orgPitch: "تسجيل مؤسستكم التعليمية لإدارة طلابها وجداولها رقمياً",
    benefits: ["جداول المعلمين بلا تضارب", "التسجيل ونقل الطلاب إلكترونياً", "إعلانات لأولياء الأمور"] },
  student_union: { group: "education", title: "اتحاد الطلاب", tagline: "عضوية وبطاقة رقمية", icon: "school", emoji: "🎒", color: "#1F5C8A", route: "/student-union-join",
    pitch: "انضم إلى اتحاد طلاب محلية الحصاحيصا واحصل على بطاقة عضوية رقمية",
    orgPitch: "تسجيل طلاب مؤسستكم في اتحاد طلاب المحلية",
    benefits: ["بطاقة عضوية يُتحقق منها برمز QR", "متابعة الطلب ومراسلة الاتحاد", "أخبار الاتحاد وأنشطته"] },
  union_manager: { group: "education", title: "إدارة اتحاد الطلاب", tagline: "عضوية المكتب التنفيذي", icon: "shield-checkmark", emoji: "🛡️", color: "#1F5C8A", route: "/union-manager-apply",
    pitch: "قدّم استمارة الانضمام إلى إدارة اتحاد الطلاب",
    orgPitch: "ترشيح ممثل عنكم لإدارة اتحاد الطلاب",
    benefits: ["بوابة لإدارة طلبات العضوية", "الاجتماعات والأخبار ورسائل الطلاب", "صلاحيات تحددها رئاسة الاتحاد"] },
  writers: { group: "education", title: "ديوان الكُتّاب", tagline: "عضوية الكُتّاب والبطاقة الموثّقة", icon: "create", emoji: "✍️", color: "#7A2E3A", route: "/writers-apply",
    pitch: "انضم إلى ديوان الكُتّاب وانشر نصوصك برقم توثيق",
    orgPitch: "انضمام أعضاء جهتكم الأدبية إلى ديوان الكُتّاب",
    benefits: ["بطاقة عضوية دولية بعلم دولة الإقامة", "نصوص موثّقة برقم وتاريخ", "المشاركة في مسابقة حصاحيصاوي الأدبية"] },
  ithraa: { group: "education", title: "مكتبة «إثراء»", tagline: "كتب ومقالات بمراجعة مشرفين", icon: "book", emoji: "📚", color: "#92400E", route: "/ithraa",
    pitch: "شارك كتبك ومقالاتك في مكتبة «إثراء» ليقرأها أهل المدينة",
    orgPitch: "إتاحة إصدارات جهتكم في مكتبة «إثراء»",
    benefits: ["نشر الكتب والمقالات بعد مراجعة المشرفين", "صفحة باسم الكاتب وإصداراته", "قرّاء من داخل المدينة وخارجها"] },
  press: { group: "education", title: "نافذة الصحافة", tagline: "دليل الصحفيين والمراسلين المعتمدين", icon: "newspaper", emoji: "📰", color: "#C8102E", route: "/press", params: { tab: "directory" },
    pitch: "سجّل في دليل الصحفيين المعتمدين بنافذة الصحافة",
    orgPitch: "إدراج صحفيي مؤسستكم في دليل الصحفيين المعتمدين",
    benefits: ["إدراج في الدليل المعتمد", "نشر الأخبار والبيانات الرسمية", "تنبيهات عاجلة تصل إلى المتابعين"] },

  // ── المجتمع والمنظمات ──
  institutions: { group: "community", title: "المؤسسات والجهات", tagline: "انضمام رسمي موثّق للمؤسسات", icon: "business", emoji: "🏛️", color: "#1F5C8A", route: "/org-join",
    pitch: "سجّل جهتك رسمياً على حصاحيصاوي",
    orgPitch: "الانضمام الرسمي الموثّق إلى منصة حصاحيصاوي",
    benefits: ["صفحة رسمية موثّقة للجهة", "إعلانات تصل إلى المتابعين", "حساب لمدير الجهة يديره بنفسه"] },
  orgs: { group: "community", title: "المنظمات والمبادرات", tagline: "منظمات المجتمع المدني والتطوع", icon: "people", emoji: "🤝", color: "#0F766E", route: "/(tabs)/orgs",
    pitch: "اعرض منظمتك ومبادراتها في قسم المنظمات",
    orgPitch: "عرض منظمتكم ومبادراتها في قسم المنظمات",
    benefits: ["صفحة للمنظمة بالأنشطة والأخبار", "استقبال المتطوعين والمتبرعين", "تواصل مباشر مع المجتمع"] },
  volunteer: { group: "community", title: "التطوع", tagline: "فرص تطوعية ونقاط إنجاز", icon: "heart-circle", emoji: "🙌", color: "#00966A", route: "/volunteer",
    pitch: "انضم إلى متطوعي الحصاحيصا واجمع نقاط إنجازك",
    orgPitch: "نشر فرص التطوع لدى جهتكم واستقبال المتطوعين",
    benefits: ["مهام تطوعية داخل المدينة", "نقاط ومستويات تقديراً للجهد", "بطاقة متطوع رقمية"] },
  communities: { group: "community", title: "الجاليات", tagline: "تسجيل الجاليات ومؤسساتها", icon: "earth", emoji: "🌐", color: "#0EA5E9", route: "/(tabs)/communities",
    pitch: "سجّل جاليتك ليتواصل معها أبناؤها",
    orgPitch: "تسجيل جاليتكم ومؤسساتها في قسم الجاليات",
    benefits: ["صفحة للجالية ومؤسساتها", "أخبار وإعلانات لأبنائها", "تواصل مع أهل المدينة في الخارج"] },
  unions: { group: "community", title: "النقابات المهنية", tagline: "عضوية النقابات والاتحادات", icon: "people-circle", emoji: "🪪", color: "#1F5C8A", route: "/(tabs)/unions",
    pitch: "قدّم طلب عضويتك في نقابتك المهنية من التطبيق",
    orgPitch: "إدارة عضوية نقابتكم واستقبال طلبات الانضمام إلكترونياً",
    benefits: ["طلب العضوية إلكترونياً", "قوانين النقابة وبرامجها", "أخبار النقابة وإعلاناتها"] },
  union_partner: { group: "community", title: "شراكة الاتحاد", tagline: "شراكات الجهات مع الاتحاد", icon: "git-merge", emoji: "🤝", color: "#1F5C8A", route: "/union-partnership-apply",
    pitch: "قدّم طلب شراكة رسمية مع الاتحاد",
    orgPitch: "إبرام شراكة رسمية بين جهتكم والاتحاد",
    benefits: ["شراكة موثّقة مع الاتحاد", "تعريف أعضاء الاتحاد بخدمات الجهة", "متابعة الطلب من الإدارة مباشرة"] },
  sports: { group: "community", title: "الأندية الرياضية", tagline: "الأندية واللاعبون والمباريات", icon: "football", emoji: "⚽", color: "#2563EB", route: "/(tabs)/sports",
    pitch: "سجّل ناديك ولاعبيه في القسم الرياضي",
    orgPitch: "تسجيل ناديكم ولاعبيه في القسم الرياضي",
    benefits: ["صفحة للنادي ولاعبيه", "أخبار المباريات والنتائج", "عضوية الجمهور في النادي"] },
  events: { group: "community", title: "منظمو الفعاليات", tagline: "مهرجانات، تخاريج، مؤتمرات، معارض", icon: "calendar", emoji: "🎪", color: "#9333EA", route: "/(tabs)/events", params: { tab: "organize" },
    pitch: "انشر فعاليتك القادمة ليعرف بها أهل المدينة ويسجّلوا فيها",
    orgPitch: "نشر فعاليات جهتكم في قسم الفعاليات",
    benefits: ["صفحة للفعالية بالموعد والمكان", "تسجيل الحضور والاستفسارات", "تأجير معدات الفعاليات"] },
  contests_sponsor: { group: "community", title: "رعاية المسابقات", tagline: "مسابقات برعاية جهات المدينة", icon: "trophy", emoji: "🏆", color: "#CA8A04", route: "/contests",
    pitch: "ارعَ مسابقة في حصاحيصاوي وقدّم جوائزها باسم جهتك",
    orgPitch: "رعاية مسابقة على منصة حصاحيصاوي باسم جهتكم",
    benefits: ["شعار الراعي على المسابقة وصفحتها", "جوائز تُعلن باسم الجهة الراعية", "مشاركة واسعة من أهل المدينة"] },

  // ── المهن والإعلانات ──
  lawyers: { group: "professional", title: "المحامون والمستشارون", tagline: "استقبال القضايا والاستشارات القانونية", icon: "briefcase", emoji: "⚖️", color: "#1F3A5F", route: "/lawyer-portal",
    pitch: "انضم إلى قسم المحامين واستقبل طلبات الاستشارة والتعاقد",
    orgPitch: "تسجيل مكتبكم القانوني في قسم المحامين",
    benefits: ["ملف مهني بالتخصص والخبرة", "طلبات استشارة وتعاقد مباشرة", "الاستمارات القانونية الجاهزة"] },
  jobs: { group: "professional", title: "الوظائف", tagline: "نشر الوظائف واستقبال المتقدمين", icon: "briefcase", emoji: "💼", color: "#00966A", route: "/(tabs)/jobs",
    pitch: "انشر وظائفك الشاغرة واستقبل طلبات المتقدمين",
    orgPitch: "نشر الوظائف الشاغرة لدى جهتكم",
    benefits: ["إعلان وظيفة بالشروط والراتب", "سير ذاتية جاهزة من المتقدمين", "متقدمون من أبناء المدينة"] },
  ads: { group: "professional", title: "الإعلانات", tagline: "إعلانات الجهات والأنشطة", icon: "megaphone", emoji: "📣", color: "#F0A500", route: "/(tabs)/ads",
    pitch: "انشر إعلان نشاطك ليصل إلى مستخدمي حصاحيصاوي",
    orgPitch: "نشر إعلانات جهتكم على منصة حصاحيصاوي",
    benefits: ["إعلان بصورة ورابط", "مراجعة الإدارة قبل النشر", "ظهور لمستخدمي المدينة"] },
};

let ready: Promise<void> | null = null;
export function ensureSectionInvitesDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS section_invites (
      id SERIAL PRIMARY KEY,
      token VARCHAR(16) NOT NULL UNIQUE,
      section_key VARCHAR(40) NOT NULL,
      invitee_name VARCHAR(160) NOT NULL,
      invitee_kind VARCHAR(8) NOT NULL DEFAULT 'person',
      invitee_phone VARCHAR(40),
      message TEXT,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      opens INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_section_invites_section ON section_invites(section_key, created_at DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS section_invite_events (
      id SERIAL PRIMARY KEY,
      invite_id INTEGER NOT NULL REFERENCES section_invites(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      fp VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_section_invite_events ON section_invite_events(invite_id, kind, created_at DESC)`);
    // تمرير الدعوة: المستلم يدعو شخصاً آخر أو جهة باسمه
    await query(`ALTER TABLE section_invites ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES section_invites(id) ON DELETE SET NULL`);
    await query(`ALTER TABLE section_invites ADD COLUMN IF NOT EXISTS inviter_name VARCHAR(160)`);
    await query(`ALTER TABLE section_invites ADD COLUMN IF NOT EXISTS depth SMALLINT NOT NULL DEFAULT 0`);
    await query(`CREATE INDEX IF NOT EXISTS idx_section_invites_parent ON section_invites(parent_id) WHERE parent_id IS NOT NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_section_invites_creator ON section_invites(created_by, created_at DESC)`);
  })().catch((e) => { ready = null; throw e; }));
}

router.use(["/admin/section-invites", "/public/section-invites", "/section-invites"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureSectionInvitesDb(); return next(); }
  catch (err) { logger.error({ err }, "[section-invites] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});
router.param("id", (_req, res, next, v) => (/^\d+$/.test(String(v)) ? next() : res.status(404).json({ error: "غير موجود" })));
router.param("token", (_req, res, next, v) => (/^[A-Za-z0-9]{6,16}$/.test(String(v)) ? next() : res.status(404).json({ error: "الدعوة غير موجودة" })));

const fail = (res: Response, err: unknown, where: string) => {
  logger.error({ err }, `[section-invites] ${where}`);
  return res.status(500).json({ error: "حدث خطأ، حاول لاحقاً" });
};

/** المدير وحده (لا المشرفون) — طلب صاحب التطبيق صراحةً */
async function adminOnly(req: Request, res: Response): Promise<SessionUser | null> {
  const me = await sessionUser(req);
  if (!me) { res.status(401).json({ error: "سجّل الدخول أولاً" }); return null; }
  if (me.role !== "admin") { res.status(403).json({ error: "هذه الميزة لمدير التطبيق فقط" }); return null; }
  return me;
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

function newToken(len = 10) {
  return Array.from({ length: len }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join("");
}

type InviteRow = {
  id: number; token: string; section_key: string; invitee_name: string; invitee_kind: string; invitee_phone: string | null;
  message: string | null; max_uses: number | null; uses: number; opens: number; expires_at: string | null;
  created_by: number | null; revoked_at: string | null; created_at: string;
  parent_id?: number | null; inviter_name?: string | null; depth?: number;
};
/** اسم الداعي: الإدارة للدعوات الأصلية، واسم المستخدم للدعوات المُمرَّرة */
const inviterOf = (r: InviteRow) => (r.inviter_name && r.parent_id ? r.inviter_name : INVITER);
/** حدود التمرير: عمق السلسلة، ودعوات كل مستخدم في اليوم ومن كل دعوة */
const FORWARD_MAX_DEPTH = 3;
const FORWARD_PER_DAY = 10;
const FORWARD_PER_INVITE = 5;
type Status = "active" | "expired" | "used" | "revoked";

function statusOf(r: InviteRow): Status {
  if (r.revoked_at) return "revoked";
  if (r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) return "expired";
  if (r.max_uses != null && r.uses >= r.max_uses) return "used";
  return "active";
}
const REASON: Record<Exclude<Status, "active">, string> = {
  revoked: "أُلغيت هذه الدعوة من قِبل الإدارة",
  expired: "انتهت صلاحية هذه الدعوة",
  used: "استُخدمت هذه الدعوة بالكامل",
};

const pageUrl = (t: string) => `${API_BASE}/api/public/section-invites/${t}/page`;
// ملاحظة: ‎/join محجوز لصفحة ثابتة قائمة (public/join.html) على Cloudflare Pages، لذا مسار التطبيق ‎/invitation
const appUrl = (t: string) => `${WEB_APP}/invitation?t=${t}`;

function sectionOut(key: string) {
  const s = SECTIONS[key];
  return s ? { key, title: s.title, tagline: s.tagline, icon: s.icon, emoji: s.emoji, color: s.color, route: s.route, params: s.params ?? {},
    group: s.group, group_title: GROUP_TITLES[s.group], benefits: s.benefits } : null;
}

function defaultMessage(key: string, kind: string) {
  const s = SECTIONS[key];
  if (!s) return "";
  const bullets = s.benefits.map((x) => `• ${x}`).join("\n");
  if (kind === "org") {
    return [
      "السادة المحترمون،",
      "تحية طيبة وبعد،",
      `تدعوكم إدارة منصة حصاحيصاوي إلى ${s.orgPitch}.`,
      "تتيح لكم المنصة:",
      bullets,
      "يُفتح نموذج الانضمام مباشرة بعد قبول الدعوة، وتراجع الإدارة الطلب وتفعّله.",
      "نتطلع إلى شراكتكم في خدمة مجتمع الحصاحيصا.",
    ].join("\n");
  }
  return [
    "السلام عليكم،",
    `${s.pitch}.`,
    "ما يقدّمه القسم:",
    bullets,
    "بعد قبول الدعوة من الرابط يُفتح نموذج التسجيل مباشرة.",
  ].join("\n");
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

function shareText(r: InviteRow) {
  const s = SECTIONS[r.section_key];
  const lines = [
    r.parent_id ? `✉️ دعوة من ${inviterOf(r)} عبر حصاحيصاوي` : `✉️ دعوة رسمية من ${INVITER}`,
    `إلى: ${r.invitee_name}`,
    `القسم: ${s?.emoji ?? ""} ${s?.title ?? "حصاحيصاوي"}${s?.tagline ? ` — ${s.tagline}` : ""}`.replace(/^القسم:\s+/, "القسم: "),
  ];
  if (r.message) lines.push("", r.message.trim());
  lines.push("", r.expires_at ? `⏳ الدعوة صالحة حتى ${fmtDate(r.expires_at)}` : "⏳ الدعوة مفتوحة الصلاحية", "", `افتح الدعوة واقبلها من هنا:\n${pageUrl(r.token)}`);
  return lines.join("\n");
}

function invOut(r: InviteRow) {
  return {
    ...r,
    status: statusOf(r),
    section: sectionOut(r.section_key),
    share_url: pageUrl(r.token),
    app_url: appUrl(r.token),
    share_text: shareText(r),
  };
}

// ── الكتالوج مع الإحصاءات ──
router.get("/admin/section-invites/sections", async (req, res) => {
  try {
    if (!(await adminOnly(req, res))) return;
    const r = await query(`SELECT section_key, COUNT(*)::int AS sent, COALESCE(SUM(opens),0)::int AS opens, COALESCE(SUM(uses),0)::int AS accepts,
      COUNT(*) FILTER (WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) AND (max_uses IS NULL OR uses<max_uses))::int AS active
      FROM section_invites GROUP BY section_key`);
    const by = new Map(r.rows.map((x: any) => [x.section_key, x]));
    const sections = Object.keys(SECTIONS).map((k) => {
      const c: any = by.get(k) || {};
      return { ...sectionOut(k)!, template_person: defaultMessage(k, "person"), template_org: defaultMessage(k, "org"),
        counts: { sent: c.sent ?? 0, opens: c.opens ?? 0, accepts: c.accepts ?? 0, active: c.active ?? 0 } };
    });
    const totals = sections.reduce((a, s) => ({ sent: a.sent + s.counts.sent, opens: a.opens + s.counts.opens, accepts: a.accepts + s.counts.accepts, active: a.active + s.counts.active }), { sent: 0, opens: 0, accepts: 0, active: 0 });
    return res.json({ sections, totals, inviter: INVITER });
  } catch (err) { return fail(res, err, "sections"); }
});

// ── إنشاء دعوة ──
router.post("/admin/section-invites", writeLimiter, async (req, res) => {
  try {
    const me = await adminOnly(req, res);
    if (!me) return;
    const b = req.body ?? {};
    const key = clip(b.section_key, 40);
    if (!SECTIONS[key]) return res.status(400).json({ error: "القسم غير معروف" });
    const name = clip(b.invitee_name, 160);
    if (name.length < 2) return res.status(400).json({ error: "اكتب اسم المدعو أو الجهة" });
    const kind = b.invitee_kind === "org" ? "org" : "person";
    const phone = clip(b.invitee_phone, 40).replace(/[^\d+]/g, "") || null;
    const message = clip(b.message, 1200) || defaultMessage(key, kind);
    let days = b.expires_days == null || b.expires_days === "" ? 30 : Math.floor(Number(b.expires_days));
    if (!Number.isFinite(days) || days < 0) days = 30;
    days = Math.min(days, 365);
    let maxUses: number | null;
    if (b.max_uses === undefined) maxUses = kind === "person" ? 1 : null;
    else if (b.max_uses === null || b.max_uses === "" || Number(b.max_uses) === 0) maxUses = null;
    else maxUses = Math.max(1, Math.min(1000, Math.floor(Number(b.max_uses)) || 1));

    for (let i = 0; i < 6; i++) {
      try {
        const r = await query(`INSERT INTO section_invites (token, section_key, invitee_name, invitee_kind, invitee_phone, message, max_uses, expires_at, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8::int=0 THEN NULL ELSE NOW() + make_interval(days => $8::int) END, $9) RETURNING *`,
          [newToken(), key, name, kind, phone, message, maxUses, days, me.id]);
        return res.status(201).json({ invite: invOut(r.rows[0]) });
      } catch (e: any) { if (e?.code !== "23505") throw e; }
    }
    return res.status(500).json({ error: "تعذّر توليد رمز فريد، حاول مجدداً" });
  } catch (err) { return fail(res, err, "create"); }
});

// ── قائمة الدعوات ──
router.get("/admin/section-invites", async (req, res) => {
  try {
    if (!(await adminOnly(req, res))) return;
    const sec = clip(req.query.section, 40);
    const r = await query(`SELECT * FROM section_invites ${sec ? "WHERE section_key=$1" : ""} ORDER BY created_at DESC LIMIT 300`, sec ? [sec] : []);
    return res.json({ invites: r.rows.map(invOut) });
  } catch (err) { return fail(res, err, "list"); }
});

// ── إلغاء / تمديد / إعادة تفعيل ──
router.patch("/admin/section-invites/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await adminOnly(req, res))) return;
    const id = Number(req.params.id);
    const action = String(req.body?.action || "");
    let r;
    if (action === "revoke") {
      r = await query(`UPDATE section_invites SET revoked_at=COALESCE(revoked_at, NOW()) WHERE id=$1 RETURNING *`, [id]);
    } else if (action === "restore") {
      r = await query(`UPDATE section_invites SET revoked_at=NULL WHERE id=$1 RETURNING *`, [id]);
    } else if (action === "extend") {
      const days = Math.min(365, Math.max(0, Math.floor(Number(req.body?.days ?? 30)) || 0));
      const addUses = Math.max(0, Math.min(1000, Math.floor(Number(req.body?.add_uses ?? 0)) || 0));
      r = await query(`UPDATE section_invites SET
          expires_at = CASE WHEN $2::int=0 THEN NULL ELSE GREATEST(NOW(), COALESCE(expires_at, NOW())) + make_interval(days => $2::int) END,
          max_uses = CASE WHEN max_uses IS NULL THEN NULL WHEN $3::int>0 THEN GREATEST(max_uses, uses) + $3::int ELSE max_uses END
        WHERE id=$1 RETURNING *`, [id, days, addUses]);
    } else return res.status(400).json({ error: "إجراء غير معروف" });
    if (!r.rows[0]) return res.status(404).json({ error: "الدعوة غير موجودة" });
    return res.json({ invite: invOut(r.rows[0]) });
  } catch (err) { return fail(res, err, "patch"); }
});

async function loadInvite(token: string): Promise<InviteRow | null> {
  return (await query(`SELECT * FROM section_invites WHERE token=$1`, [token])).rows[0] ?? null;
}

/** فتحة واحدة لكل (IP + المتصفح) يومياً، ولا تُحتسب فتحات المدير نفسه */
async function recordOpen(req: Request, inv: InviteRow) {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    const ua = String(req.headers["user-agent"] || "").slice(0, 200);
    const day = new Date().toISOString().slice(0, 10);
    const fp = createHash("sha256").update(`${inv.id}|${ip}|${ua}|${day}`).digest("hex");
    const me = await sessionUser(req).catch(() => null);
    if (me?.role === "admin") return;
    const ins = await query(`INSERT INTO section_invite_events (invite_id, kind, user_id, fp)
      SELECT $1::int,'open',$2::int,$3::varchar WHERE NOT EXISTS (SELECT 1 FROM section_invite_events WHERE invite_id=$1::int AND kind='open' AND fp=$3::varchar) RETURNING id`,
      [inv.id, me?.id ?? null, fp]);
    if (ins.rows[0]) await query(`UPDATE section_invites SET opens=opens+1 WHERE id=$1`, [inv.id]);
  } catch (err) { logger.warn({ err }, "[section-invites] open"); }
}

function publicOut(inv: InviteRow | null) {
  if (!inv || !SECTIONS[inv.section_key]) return { valid: false, reason: "الدعوة غير موجودة أو الرابط غير صحيح", status: "missing" as const };
  const st = statusOf(inv);
  return {
    valid: st === "active",
    reason: st === "active" ? null : REASON[st],
    status: st,
    section: sectionOut(inv.section_key),
    invitee_name: inv.invitee_name,
    invitee_kind: inv.invitee_kind,
    message: inv.message,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
    inviter: inviterOf(inv),
    relayed: !!inv.parent_id,
    depth: inv.depth ?? 0,
    can_forward: st === "active" || st === "used" ? (inv.depth ?? 0) < FORWARD_MAX_DEPTH : false,
    share_url: pageUrl(inv.token),
    app_url: appUrl(inv.token),
  };
}

// ── العرض العام (JSON) ──
router.get("/public/section-invites/:token", async (req, res) => {
  try {
    const inv = await loadInvite(String(req.params.token));
    if (inv) await recordOpen(req, inv);
    const out: any = publicOut(inv);
    const me = inv ? await sessionUser(req).catch(() => null) : null;
    if (inv && me) {
      out.accepted_by_me = !!(await query(`SELECT 1 FROM section_invite_events WHERE invite_id=$1 AND kind='accept' AND user_id=$2 LIMIT 1`, [inv.id, me.id])).rows[0];
      out.my_forwards = (await query(`SELECT COUNT(*)::int AS n FROM section_invites WHERE parent_id=$1 AND created_by=$2`, [inv.id, me.id])).rows[0].n;
    }
    return res.status(inv ? 200 : 404).json(out);
  } catch (err) { return fail(res, err, "public"); }
});

// ── قبول الدعوة ──
router.post("/section-invites/:token/accept", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لقبول الدعوة" });
    const inv = await loadInvite(String(req.params.token));
    if (!inv || !SECTIONS[inv.section_key]) return res.status(404).json({ error: "الدعوة غير موجودة" });
    const s = SECTIONS[inv.section_key];
    const nav = { route: s.route, params: s.params ?? {}, section: sectionOut(inv.section_key) };
    // نفس المستخدم يعيد فتح دعوة قبلها سابقاً: نوجّهه دون احتساب استخدام جديد
    const prev = await query(`SELECT 1 FROM section_invite_events WHERE invite_id=$1 AND kind='accept' AND user_id=$2 LIMIT 1`, [inv.id, me.id]);
    if (prev.rows[0]) return res.json({ ok: true, already: true, ...nav });
    const upd = await query(`UPDATE section_invites SET uses=uses+1
      WHERE id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) AND (max_uses IS NULL OR uses<max_uses) RETURNING *`, [inv.id]);
    if (!upd.rows[0]) {
      const st = statusOf(inv);
      return res.status(410).json({ error: st === "active" ? REASON.used : REASON[st], status: st === "active" ? "used" : st });
    }
    await query(`INSERT INTO section_invite_events (invite_id, kind, user_id) VALUES ($1,'accept',$2)`, [inv.id, me.id]);
    if (inv.created_by) {
      await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'general',$2,$3,$4)`,
        [inv.created_by, "✉️ قُبلت دعوة انضمام", `قبل ${me.name || "مستخدم"} دعوة «${inv.invitee_name}» للانضمام إلى ${s.title}.`,
          JSON.stringify(inv.parent_id ? { type: "general", screen: "invitation", t: inv.token } : { type: "general", screen: "admin-invites" })]).catch(() => {});
    }
    return res.json({ ok: true, already: false, ...nav });
  } catch (err) { return fail(res, err, "accept"); }
});

// ── تمرير الدعوة: المستلم يدعو شخصاً آخر أو جهة إلى القسم نفسه ──
function forwardMessage(key: string, kind: string, from: string, note: string) {
  const s = SECTIONS[key];
  if (!s) return note;
  const head = kind === "org"
    ? [`السادة المحترمون،`, `يسرّني دعوتكم إلى ${s.orgPitch} عبر منصة حصاحيصاوي.`]
    : [`السلام عليكم،`, `أدعوك للانضمام إلى «${s.title}» في حصاحيصاوي — ${s.pitch}.`];
  return [...head, ...(note ? ["", note] : []), "", `— ${from}`].join("\n");
}

router.post("/section-invites/:token/forward", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لدعوة غيرك" });
    if (me.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const parent = await loadInvite(String(req.params.token));
    if (!parent || !SECTIONS[parent.section_key]) return res.status(404).json({ error: "الدعوة غير موجودة" });
    const st = statusOf(parent);
    const accepted = !!(await query(`SELECT 1 FROM section_invite_events WHERE invite_id=$1 AND kind='accept' AND user_id=$2 LIMIT 1`, [parent.id, me.id])).rows[0];
    // المستلم: من يحمل دعوة سارية، أو من قبلها (ولو اكتمل عدد استخداماتها)
    if (st === "revoked" || st === "expired" || (st === "used" && !accepted)) return res.status(410).json({ error: REASON[st as Exclude<Status, "active">] });
    if ((parent.depth ?? 0) >= FORWARD_MAX_DEPTH) return res.status(409).json({ error: "وصلت هذه الدعوة إلى أقصى عدد من مرات التمرير" });
    const b = req.body ?? {};
    const name = clip(b.invitee_name, 160);
    if (name.length < 2) return res.status(400).json({ error: "اكتب اسم الشخص أو الجهة" });
    const kind = b.invitee_kind === "org" ? "org" : "person";
    const phone = clip(b.invitee_phone, 40).replace(/[^\d+]/g, "") || null;
    const day = (await query(`SELECT COUNT(*)::int AS n FROM section_invites WHERE created_by=$1 AND parent_id IS NOT NULL AND created_at > NOW() - INTERVAL '1 day'`, [me.id])).rows[0].n;
    if (day >= FORWARD_PER_DAY) return res.status(429).json({ error: `يمكنك إرسال ${FORWARD_PER_DAY} دعوات يومياً — حاول غداً` });
    const fromThis = (await query(`SELECT COUNT(*)::int AS n FROM section_invites WHERE created_by=$1 AND parent_id=$2`, [me.id, parent.id])).rows[0].n;
    if (fromThis >= FORWARD_PER_INVITE) return res.status(429).json({ error: `أرسلت ${FORWARD_PER_INVITE} دعوات من هذه الدعوة` });
    const from = clip(me.name, 160) || "مستخدم حصاحيصاوي";
    const message = forwardMessage(parent.section_key, kind, from, clip(b.note, 500));
    for (let i = 0; i < 6; i++) {
      try {
        const r = await query(`INSERT INTO section_invites (token, section_key, invitee_name, invitee_kind, invitee_phone, message, max_uses, expires_at, created_by, parent_id, inviter_name, depth)
          VALUES ($1,$2,$3,$4,$5,$6,1, NOW() + INTERVAL '30 days', $7,$8,$9,$10) RETURNING *`,
          [newToken(), parent.section_key, name, kind, phone, message, me.id, parent.id, from, (parent.depth ?? 0) + 1]);
        return res.status(201).json({ invite: invOut(r.rows[0]) });
      } catch (e: any) { if (e?.code !== "23505") throw e; }
    }
    return res.status(500).json({ error: "تعذّر توليد رمز فريد، حاول مجدداً" });
  } catch (err) { return fail(res, err, "forward"); }
});

// ── الدعوات التي أرسلها المستخدم (من دعوة محددة أو كلها) ──
router.get("/section-invites/mine", async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const t = String(req.query.from || "");
    let parentId: number | null = null;
    if (t) { const p = /^[A-Za-z0-9]{6,16}$/.test(t) ? await loadInvite(t) : null; if (!p) return res.json({ invites: [] }); parentId = p.id; }
    const r = await query(`SELECT * FROM section_invites WHERE created_by=$1 AND parent_id IS NOT NULL ${parentId ? "AND parent_id=$2" : ""} ORDER BY created_at DESC LIMIT 100`,
      parentId ? [me.id, parentId] : [me.id]);
    return res.json({ invites: r.rows.map(invOut) });
  } catch (err) { return fail(res, err, "mine"); }
});

// ── صفحة الدعوة العامة (HTML + Open Graph) ──
router.get("/public/section-invites/:token/page", async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const inv = await loadInvite(String(req.params.token));
    if (inv) await recordOpen(req, inv);
    const p = publicOut(inv);
    return res.status(inv ? 200 : 404).send(renderPage(String(req.params.token), p));
  } catch (err) {
    logger.error({ err }, "[section-invites] page");
    return res.status(500).send(`<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px">حدث خطأ، حاول لاحقاً</body>`);
  }
});

function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function renderPage(token: string, p: ReturnType<typeof publicOut>) {
  const sec = "section" in p ? p.section : null;
  const color = sec?.color || "#00966A";
  const deep = shade(color, -0.22);
  const title = sec ? `دعوة رسمية للانضمام إلى ${sec.title}` : "دعوة حصاحيصاوي";
  const name = "invitee_name" in p ? p.invitee_name : "";
  const desc = sec
    ? `${name ? `إلى ${name} — ` : ""}يسعد ${("inviter" in p && p.inviter) || INVITER} دعوتكم للانضمام إلى «${sec.title}» في تطبيق حصاحيصاوي. ${sec.tagline}.`
    : "الدعوة غير موجودة أو الرابط غير صحيح.";
  const msg = "message" in p && p.message ? p.message : "";
  const exp = "expires_at" in p ? p.expires_at : null;
  const validity = !p.valid ? "" : exp ? `صالحة حتى ${fmtDate(exp)}` : "مفتوحة الصلاحية";
  const joinUrl = appUrl(token);
  const self = pageUrl(token);
  const logo = `${WEB_APP}/icon.png`;
  const kindLbl = "invitee_kind" in p && p.invitee_kind === "org" ? "جهة مدعوّة" : "مدعوّ كريم";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · حصاحيصاوي</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="${esc(color)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="حصاحيصاوي">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="✉️ ${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(self)}">
<meta property="og:image" content="${esc(`${WEB_APP}/og/hasahisawi.png`)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(`${WEB_APP}/og/hasahisawi.png`)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="✉️ ${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Cairo,Tahoma,sans-serif;background:#F2F5F3;color:#1A2C25;-webkit-font-smoothing:antialiased}
.wrap{max-width:520px;margin:0 auto;padding:22px 16px 36px}
.card{position:relative;overflow:hidden;border-radius:28px;background:linear-gradient(150deg,${esc(color)} 0%,${esc(deep)} 100%);color:#fff;padding:26px 22px 24px;box-shadow:0 18px 40px -18px ${esc(deep)}}
.card:before{content:"";position:absolute;inset:-40% -30% auto auto;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.22),rgba(255,255,255,0) 70%)}
.card:after{content:"";position:absolute;inset:auto auto -90px -70px;width:240px;height:240px;border-radius:50%;border:34px solid rgba(255,255,255,.07)}
.top{display:flex;align-items:center;gap:10px;position:relative}
.logo{width:44px;height:44px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
.logo img{width:36px;height:36px;object-fit:contain}
.brand{font-weight:800;font-size:17px}.brand small{display:block;font-weight:600;font-size:12px;opacity:.85}
.seal{margin-inline-start:auto;font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35)}
.kicker{position:relative;margin-top:26px;font-size:13px;letter-spacing:.3px;opacity:.9;font-weight:700}
.icon{position:relative;width:74px;height:74px;border-radius:24px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:38px;margin-top:12px}
h1{position:relative;margin:14px 0 4px;font-size:27px;line-height:1.4;font-weight:800}
.tag{position:relative;opacity:.9;font-size:14.5px}
.to{position:relative;margin-top:20px;background:rgba(255,255,255,.95);color:#1A2C25;border-radius:18px;padding:14px 16px}
.to small{display:block;color:#6B7B74;font-size:12px;font-weight:700}.to b{font-size:19px}
.msg{background:#fff;border-radius:22px;padding:18px 18px;margin-top:14px;line-height:2;font-size:15.5px;white-space:pre-line;border:1px solid #E3EAE6}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.chip{background:#fff;border:1px solid #E3EAE6;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;color:#40524A}
.btn{display:block;margin-top:14px;text-align:center;padding:16px;border-radius:18px;font-size:17.5px;font-weight:800;text-decoration:none}
.primary{background:${esc(color)};color:#fff;box-shadow:0 10px 24px -12px ${esc(deep)}}
.ghost{background:#fff;color:#1A2C25;border:1.5px solid #D6E0DB}
.bad{background:#FFF4F2;border:1px solid #F6C9C1;color:#9B2C1F;border-radius:18px;padding:14px 16px;margin-top:14px;font-weight:700;text-align:center}
.foot{text-align:center;color:#6B7B74;font-size:13px;margin-top:18px;line-height:1.9}
.sig{margin-top:14px;font-size:13.5px;text-align:left;opacity:.95;position:relative}
</style></head>
<body><div class="wrap">
<div class="card">
  <div class="top"><div class="logo"><img src="${esc(logo)}" alt="" onerror="this.parentNode.textContent='💚'"></div>
  <div class="brand">حصاحيصاوي<small>خدمات مدينة الحصاحيصا</small></div><div class="seal">${"relayed" in p && p.relayed ? "دعوة شخصية" : "دعوة رسمية"}</div></div>
  <div class="kicker">${"relayed" in p && p.relayed ? "دعوة للانضمام" : "دعوة رسمية للانضمام"}</div>
  <div class="icon">${esc(sec?.emoji || "✉️")}</div>
  <h1>${esc(sec?.title || "دعوة غير متاحة")}</h1>
  <div class="tag">${esc(sec?.tagline || "")}</div>
  ${name ? `<div class="to"><small>${esc(kindLbl)} · إلى</small><b>${esc(name)}</b></div>` : ""}
  <div class="sig">— ${esc(("inviter" in p && p.inviter) || INVITER)}</div>
</div>
${msg ? `<div class="msg">${esc(msg)}</div>` : ""}
${p.valid ? `<div class="meta"><span class="chip">⏳ ${esc(validity)}</span><span class="chip">🔒 دعوة خاصة</span></div>
<a class="btn primary" href="${esc(joinUrl)}">افتح الدعوة في التطبيق</a>
<a class="btn ghost" href="${esc(PLAY_URL)}">حمّل التطبيق من Google Play</a>`
  : `<div class="bad">${esc(p.reason || "الدعوة غير متاحة")}</div>
<a class="btn ghost" href="${esc(PLAY_URL)}">حمّل تطبيق حصاحيصاوي</a>`}
<div class="foot">افتح الدعوة ثم سجّل دخولك أو أنشئ حساباً — ستنتقل مباشرةً إلى نموذج الانضمام للقسم.<br>💌 بعد فتح الدعوة يمكنك أيضاً دعوة شخص آخر أو جهة تعرفها.<br>مستخدمو آيفون: يعمل التطبيق من المتصفح ويمكن إضافته للشاشة الرئيسية.</div>
</div></body></html>`;
}

export default router;
