import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const files = [
  'app/(tabs)/women.tsx',
  'app/(tabs)/index.tsx',
  'lib/translations.ts',
].map(p => resolve(root, p));

let changed = false;

for (const file of files) {
  if (!existsSync(file)) continue;
  let src = readFileSync(file, 'utf8');
  const before = src;
  src = src
    .replaceAll('حواء', 'المرأة')
    .replaceAll('ركن المرأة', 'قسم المرأة')
    .replaceAll('ركن للمرأة', 'قسم المرأة')
    .replaceAll('ركن خاص بالمرأة', 'قسم خاص بالمرأة');

  if (file.endsWith('women.tsx')) {
    if (!src.includes('normalizeWomenGender')) {
      src = src.replace(
        'const { width } = Dimensions.get("window");',
        `const { width } = Dimensions.get("window");

function normalizeWomenGender(value) {
  const g = String(value ?? "").trim().toLowerCase();
  if (["male", "m", "man", "ذكر", "رجل", "ولد"].includes(g)) return "male";
  if (["female", "f", "woman", "أنثى", "انثى", "امرأة", "امراة", "بنت"].includes(g)) return "female";
  return null;
}`,
      );
    }
    src = src.replace(
      '  const { user, isGuest, setUserGender } = useAuth();',
      '  const { user, isGuest, setUserGender } = useAuth();',
    );
    src = src.replace(
      /\n\s*const isWomenAdmin = user\?\.role === "admin";\n\s*const isMaleBlocked = user\?\.gender === "male" && !isWomenAdmin;\n\s*const needsGenderForWomen = !user\?\.gender && !isWomenAdmin;/g,
      '',
    );
    if (!src.includes('const womenGender = normalizeWomenGender')) {
      src = src.replace(
        '  const [expandedTip, setExpandedTip]       = useState<string | null>(null);',
        `  const [expandedTip, setExpandedTip]       = useState<string | null>(null);
  const womenGender = normalizeWomenGender(user?.gender);
  const isWomenAdmin = user?.role === "admin";
  const isMaleBlocked = womenGender === "male" && !isWomenAdmin;
  const needsGenderForWomen = !womenGender && !isWomenAdmin;`,
      );
    }
    src = src.replace(
      '  const load = async () => {\n    try {',
      '  const load = async () => {\n    if (!user || isGuest || isMaleBlocked || needsGenderForWomen) return;\n    try {',
    );
    src = src.replace('if (user.gender === "male")', 'if (isMaleBlocked)');
    src = src.replace('if (!user.gender)', 'if (needsGenderForWomen)');
    src = src.replace('هذا القسم مخصّص للسيدات فقط — نحرص على توفير مساحة آمنة وخاصة لهن.', 'هذا القسم محجوب تلقائياً على حسابات الذكور، ولا يمكن الدخول إليه إلا بحساب إدارة.');
  }

  if (file.endsWith('index.tsx')) {
    if (!src.includes('import { useAuth } from "@/lib/auth-context";')) {
      src = src.replace('import AnimatedPress from "@/components/AnimatedPress";', 'import AnimatedPress from "@/components/AnimatedPress";\nimport { useAuth } from "@/lib/auth-context";');
    }
    if (!src.includes('normalizeHomeGender')) {
      src = src.replace(
        'const LOGO = require("@/assets/images/logo.png");',
        `const LOGO = require("@/assets/images/logo.png");

function normalizeHomeGender(value) {
  const g = String(value ?? "").trim().toLowerCase();
  if (["male", "m", "man", "ذكر", "رجل", "ولد"].includes(g)) return "male";
  if (["female", "f", "woman", "أنثى", "انثى", "امرأة", "امراة", "بنت"].includes(g)) return "female";
  return null;
}`,
      );
    }
    src = src.replace(
      '  const date = useMemo(() => new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" }), []);',
      '  const date = useMemo(() => new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" }), []);',
    );
    if (!src.includes('const visibleServices = useMemo')) {
      src = src.replace(
        '  const date = useMemo(() => new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" }), []);',
        `  const date = useMemo(() => new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" }), []);
  const { user } = useAuth();
  const visibleServices = useMemo(() => {
    const gender = normalizeHomeGender(user?.gender);
    if (gender === "male" && user?.role !== "admin") return SERVICES.filter(item => item.id !== "women");
    return SERVICES;
  }, [user?.gender, user?.role]);`,
      );
    } else {
      src = src.replace(
        'if (user?.gender === "male" && user.role !== "admin") return SERVICES.filter(item => item.id !== "women");',
        'const gender = normalizeHomeGender(user?.gender);\n    if (gender === "male" && user?.role !== "admin") return SERVICES.filter(item => item.id !== "women");',
      );
    }
    src = src.replace('SERVICES.map((item, index) => <ServiceCard key={item.id} item={item} index={index} />)', 'visibleServices.map((item, index) => <ServiceCard key={item.id} item={item} index={index} />)');
  }

  if (src !== before) {
    writeFileSync(file, src);
    changed = true;
  }
}

console.log(changed ? 'women access guard applied' : 'women access guard already clean');
