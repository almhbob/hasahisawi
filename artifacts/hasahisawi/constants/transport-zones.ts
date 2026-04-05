// ─── نظام المناطق والتعرفة — ترحال والتوصيل ─────────────────────────────────
// مبني على خارطة أحياء الحصاحيصا وتقدير المسافات الواقعية

export type ZoneId = 1 | 2 | 3 | 4 | 5;
export type VehicleType = "car" | "rickshaw" | "delivery";

export interface TransportZone {
  id: ZoneId;
  name: string;
  nameEn: string;
  color: string;
  icon: string;
  description: string;
  neighborhoods: string[];
}

export interface FareMatrix {
  [fromZone: number]: {
    [toZone: number]: {
      car: number;
      rickshaw: number;
      delivery: number;
    };
  };
}

// ─── تعريف المناطق ────────────────────────────────────────────────────────────
export const TRANSPORT_ZONES: TransportZone[] = [
  {
    id: 1,
    name: "قلب المدينة",
    nameEn: "City Center",
    color: "#F97316",
    icon: "city",
    description: "الأحياء الداخلية — المركز الرئيسي للمدينة",
    neighborhoods: [
      "الحي الشرقي", "الحي الأوسط", "حي الواحة", "حي الصفاء",
      "حي الزهور", "حي العمدة", "حي الموظفين", "حي كريمة",
      "حي الفيحاء", "حي الصداقة",
    ],
  },
  {
    id: 2,
    name: "الأحياء الوسطى",
    nameEn: "Middle Ring",
    color: "#3E9CBF",
    icon: "home-city",
    description: "الأحياء المحيطة بالمركز",
    neighborhoods: [
      "حي المايقوما", "حي الضقالة", "حي فور", "الامتداد",
      "الحلة الجديدة", "المنصورة", "المزاد",
    ],
  },
  {
    id: 3,
    name: "أطراف المدينة",
    nameEn: "Outer Neighborhoods",
    color: "#A855F7",
    icon: "map-marker-radius",
    description: "كمبو والجملونات وما يحيط بها",
    neighborhoods: [
      "الكرمك", "كمبو المحالج", "الجملونات", "الطائف",
      "ود الكامل", "أركويت", "الطالباب", "الكشامر",
    ],
  },
  {
    id: 4,
    name: "المناطق الفرعية",
    nameEn: "Sub-Districts",
    color: "#3EFF9C",
    icon: "map-marker-outline",
    description: "المناطق الطرفية الفرعية",
    neighborhoods: [
      "أم دغينة", "أم عضام", "ود السيد", "أبو فروع",
      "عمارة أبيد", "ود سلفاب", "ود الفادني", "أبو جيلي",
      "ودشمو", "أربجي",
    ],
  },
  {
    id: 5,
    name: "القرى المحيطة",
    nameEn: "Surrounding Villages",
    color: "#FBBF24",
    icon: "terrain",
    description: "قرى ووحدات إدارية تابعة للمحلية",
    neighborhoods: [
      "المسلمية", "ود حبوبة", "أبو قوتة", "الربع", "طابت",
      "المحيريبا", "قرية الولي", "ود بهاي", "طيبة الشيخ القرشي",
      "كبنة", "تنة", "بانت", "الجلاد", "ود العباس", "طابية",
      "بمبان", "هيصة", "ود النيل", "أم ضباع", "حلفاية الحصاحيصا",
      "الشيخ حماد", "الشيخ طيب", "ود بلال", "أبو عشر", "الدوينيب",
    ],
  },
];

// ─── مصفوفة التعرفة الافتراضية (بالجنيه السوداني) ────────────────────────────
// القيم قابلة للتعديل من مشرف القسم في لوحة الإدارة
export const DEFAULT_FARE_MATRIX: FareMatrix = {
  1: {
    1: { car: 500,  rickshaw: 300,  delivery: 600  },
    2: { car: 1000, rickshaw: 600,  delivery: 1200 },
    3: { car: 1500, rickshaw: 900,  delivery: 1800 },
    4: { car: 2000, rickshaw: 1200, delivery: 2400 },
    5: { car: 3000, rickshaw: 1800, delivery: 3600 },
  },
  2: {
    1: { car: 1000, rickshaw: 600,  delivery: 1200 },
    2: { car: 500,  rickshaw: 300,  delivery: 600  },
    3: { car: 1200, rickshaw: 700,  delivery: 1400 },
    4: { car: 1500, rickshaw: 900,  delivery: 1800 },
    5: { car: 2500, rickshaw: 1500, delivery: 3000 },
  },
  3: {
    1: { car: 1500, rickshaw: 900,  delivery: 1800 },
    2: { car: 1200, rickshaw: 700,  delivery: 1400 },
    3: { car: 700,  rickshaw: 400,  delivery: 800  },
    4: { car: 1200, rickshaw: 700,  delivery: 1400 },
    5: { car: 2000, rickshaw: 1200, delivery: 2400 },
  },
  4: {
    1: { car: 2000, rickshaw: 1200, delivery: 2400 },
    2: { car: 1500, rickshaw: 900,  delivery: 1800 },
    3: { car: 1200, rickshaw: 700,  delivery: 1400 },
    4: { car: 700,  rickshaw: 400,  delivery: 800  },
    5: { car: 2000, rickshaw: 1200, delivery: 2400 },
  },
  5: {
    1: { car: 3000, rickshaw: 1800, delivery: 3600 },
    2: { car: 2500, rickshaw: 1500, delivery: 3000 },
    3: { car: 2000, rickshaw: 1200, delivery: 2400 },
    4: { car: 2000, rickshaw: 1200, delivery: 2400 },
    5: { car: 1500, rickshaw: 900,  delivery: 1800 },
  },
};

// ─── مساعد: إيجاد منطقة حي معين ──────────────────────────────────────────────
export function getZoneForNeighborhood(neighborhood: string): TransportZone | null {
  return TRANSPORT_ZONES.find(z => z.neighborhoods.includes(neighborhood)) ?? null;
}

// ─── مساعد: تقدير التعرفة ─────────────────────────────────────────────────────
export function estimateFare(
  fromZone: ZoneId,
  toZone: ZoneId,
  vehicleType: VehicleType,
  matrix: FareMatrix = DEFAULT_FARE_MATRIX,
): number {
  return matrix[fromZone]?.[toZone]?.[vehicleType] ?? 0;
}

// ─── مساعد: تنسيق المبلغ ──────────────────────────────────────────────────────
export function formatFare(amount: number): string {
  return amount.toLocaleString("ar-SD") + " جنيه";
}

// ─── أسماء أنواع المركبات ─────────────────────────────────────────────────────
export const VEHICLE_LABELS: Record<VehicleType, string> = {
  car: "سيارة",
  rickshaw: "ركشة",
  delivery: "توصيل طلب",
};

export const VEHICLE_ICONS: Record<VehicleType, string> = {
  car: "car-side",
  rickshaw: "rickshaw",
  delivery: "package-variant",
};

// ─── مفاتيح تخزين التعرفة ─────────────────────────────────────────────────────
export const FARE_STORAGE_KEY = "transport_fare_matrix_v1";
