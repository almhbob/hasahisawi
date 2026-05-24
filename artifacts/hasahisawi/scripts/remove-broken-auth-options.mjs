import { readFileSync, writeFileSync } from 'node:fs';

const authModalFile = new URL('../components/AuthModal.tsx', import.meta.url);
let src = readFileSync(authModalFile, 'utf8');
const before = src;

function replaceAll(from, to) {
  src = src.split(from).join(to);
}

function removeRegex(regex, label) {
  const next = src.replace(regex, '');
  if (next === src) console.warn(`[remove-broken-auth-options] skipped ${label}: not found`);
  src = next;
}

// Remove password reset mode from AuthModal. It is currently broken in production.
replaceAll('import { firebaseSendPasswordReset } from "@/lib/firebase/auth";\n', '');
replaceAll('type Mode = "login" | "register" | "forgot";', 'type Mode = "login" | "register";');
replaceAll('    setForgotEmail(""); setForgotSuccess(false);\n', '');

removeRegex(/\n  const \[forgotEmail, setForgotEmail\] = useState\(""\);\n  const \[forgotSuccess, setForgotSuccess\] = useState\(false\);/g, 'forgot state');
removeRegex(/\n  const handleForgotPassword = async \(\) => \{[\s\S]*?\n  \};\n\n  const dir =/m, '\n  const dir =', 'forgot handler');

replaceAll(
  '                name={mode === "login" ? "log-in-outline" : mode === "forgot" ? "key-outline" : "person-add-outline"}',
  '                name={mode === "login" ? "log-in-outline" : "person-add-outline"}',
);
replaceAll(
  '{mode === "login" ? "تسجيل الدخول" : mode === "forgot" ? "استعادة كلمة السر" : "إنشاء حساب جديد"}',
  '{mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}',
);

// Make the mode toggle always render because only login/register remain.
src = src.replace(
/          \{\/\* Mode toggle \*\/\}\n          \{mode !== "forgot" && \(\n([\s\S]*?)\n          \)\}/m,
'          {/* Mode toggle */}\n$1',
);

// Remove the forgot-password UI block.
removeRegex(/\n\s*\{\/\* ===== وضع استعادة كلمة السر ===== \*\/\}\n\s*\{mode === "forgot" && \([\s\S]*?\n\s*\{\/\* ===== وضع تسجيل الدخول \/ التسجيل ===== \*\/\}\n\s*\{mode !== "forgot" && \(<>/m, '\n              {/* ===== وضع تسجيل الدخول / التسجيل ===== */}\n              <>', 'forgot UI block');

// Remove the login screen forgot link.
removeRegex(/\n\s*\{\/\* نسيت كلمة المرور\؟ \*\/\}\n\s*\{mode === "login" && \([\s\S]*?\n\s*\)\}/m, 'forgot link');

// Close the now-unconditional fragment.
src = src.replace('\n              </>)}\n\n            </View>', '\n              </>\n\n            </View>');

if (src !== before) {
  writeFileSync(authModalFile, src);
  console.log('[remove-broken-auth-options] Removed password reset from AuthModal.');
} else {
  console.log('[remove-broken-auth-options] AuthModal already clean.');
}

// Defensive cleanup for any generated/auth screen containing QR/mobile-login cards.
// This intentionally targets Arabic copy from the production UI screenshot.
const candidateFiles = [
  new URL('../app/index.tsx', import.meta.url),
  new URL('../app/login.tsx', import.meta.url),
  new URL('../app/(auth)/login.tsx', import.meta.url),
  new URL('../components/AuthScreen.tsx', import.meta.url),
  authModalFile,
];

for (const file of candidateFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const original = content;

  // Remove complete JSX blocks whose text is clearly the broken QR/mobile login option.
  content = content.replace(/\n\s*<TouchableOpacity[\s\S]{0,2200}?تسجيل الدخول عبر الجوال[\s\S]{0,900}?<\/TouchableOpacity>/g, '');
  content = content.replace(/\n\s*<Pressable[\s\S]{0,2200}?تسجيل الدخول عبر الجوال[\s\S]{0,900}?<\/Pressable>/g, '');
  content = content.replace(/\n\s*<AnimatedPress[\s\S]{0,2200}?تسجيل الدخول عبر الجوال[\s\S]{0,900}?<\/AnimatedPress>/g, '');
  content = content.replace(/\n\s*<TouchableOpacity[\s\S]{0,2200}?امسح رمز QR[\s\S]{0,900}?<\/TouchableOpacity>/g, '');
  content = content.replace(/\n\s*<Pressable[\s\S]{0,2200}?امسح رمز QR[\s\S]{0,900}?<\/Pressable>/g, '');

  if (content !== original) {
    writeFileSync(file, content);
    console.log(`[remove-broken-auth-options] Removed QR/mobile login from ${file.pathname}`);
  }
}
