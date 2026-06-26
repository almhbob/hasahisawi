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
    src = src.replace(
      '  const { user, isGuest, setUserGender } = useAuth();',
      '  const { user, isGuest, setUserGender } = useAuth();\n  const isWomenAdmin = user?.role === "admin";\n  const isMaleBlocked = user?.gender === "male" && !isWomenAdmin;\n  const needsGenderForWomen = !user?.gender && !isWomenAdmin;',
    );
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
    if (!src.includes('const visibleServices = useMemo')) {
      src = src.replace(
        '  const date = useMemo(() => new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" }), []);',
        '  const date = useMemo(() => new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" }), []);\n  const { user } = useAuth();\n  const visibleServices = useMemo(() => {\n    if (user?.gender === "male" && user.role !== "admin") return SERVICES.filter(item => item.id !== "women");\n    return SERVICES;\n  }, [user?.gender, user?.role]);',
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
