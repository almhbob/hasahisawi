import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
let changed = false;

function patchFile(rel, mutator) {
  const file = resolve(root, rel);
  if (!existsSync(file)) return;
  const before = readFileSync(file, 'utf8');
  const after = mutator(before);
  if (after !== before) {
    writeFileSync(file, after);
    changed = true;
  }
}

patchFile('constants/colors.ts', (src) => {
  let s = src;
  const replace = (a, b) => { s = s.replace(a, b); };
  replace('const primary      = "#22C55E";', 'const primary      = "#1FA971";');
  replace('const primaryDeep  = "#16A34A";', 'const primaryDeep  = "#0E7C55";');
  replace('const primaryDim   = "#15803D";', 'const primaryDim   = "#157B58";');
  replace('const primaryLight = "#86EFAC";', 'const primaryLight = "#68D7A6";');
  replace('const primarySoft  = "#DCFCE7";', 'const primarySoft  = "rgba(31,169,113,0.14)";');
  replace('const primaryGlow  = "rgba(34,197,94,0.18)";', 'const primaryGlow  = "rgba(31,169,113,0.22)";');
  replace('const accent       = "#EAB308";', 'const accent       = "#F4B400";');
  replace('const accentDeep   = "#A16207";', 'const accentDeep   = "#B98500";');
  replace('const accentDim    = "#CA8A04";', 'const accentDim    = "#D8A100";');
  replace('const accentLight  = "#FDE047";', 'const accentLight  = "#FFD766";');
  replace('const accentGlow   = "rgba(234,179,8,0.18)";', 'const accentGlow   = "rgba(244,180,0,0.18)";');

  replace('const bg              = "#07110A";', 'const bg              = "#08110D";');
  replace('const bgDeep          = "#040C07";', 'const bgDeep          = "#050A08";');
  replace('const surface1        = "#0A1A0D";', 'const surface1        = "rgba(255,255,255,0.045)";');
  replace('const surface2        = "#0D2211";', 'const surface2        = "rgba(255,255,255,0.070)";');
  replace('const surface3        = "#112B15";', 'const surface3        = "rgba(255,255,255,0.105)";');
  replace('const surface4        = "#163519";', 'const surface4        = "rgba(255,255,255,0.135)";');
  replace('const cardBg          = surface2;', 'const cardBg          = "rgba(255,255,255,0.072)";');
  replace('const cardBgElevated  = surface3;', 'const cardBgElevated  = "rgba(255,255,255,0.115)";');
  replace('const glassCard       = "rgba(34,197,94,0.07)";', 'const glassCard       = "rgba(255,255,255,0.082)";');
  replace('const textPrimary    = "#F0FFF4";', 'const textPrimary    = "#F7FFF9";');
  replace('const textSecondary  = "#BBF7D0";', 'const textSecondary  = "#D7E8DE";');
  replace('const textMuted      = "#A3C5AC";', 'const textMuted      = "#9FB3A8";');
  replace('const textSubtle     = "#7A9E84";', 'const textSubtle     = "#71867B";');
  replace('const divider        = "#0F2A15";', 'const divider        = "rgba(255,255,255,0.085)";');
  replace('const dividerSoft    = "#081A0C";', 'const dividerSoft    = "rgba(255,255,255,0.055)";');
  replace('const borderGlow     = "rgba(34,197,94,0.20)";', 'const borderGlow     = "rgba(31,169,113,0.30)";');
  replace('const borderGoldGlow = "rgba(234,179,8,0.22)";', 'const borderGoldGlow = "rgba(244,180,0,0.24)";');

  if (!s.includes('const bgAlt')) s = s.replace('const bgDeep          = "#050A08";', 'const bgDeep          = "#050A08";\nconst bgAlt           = "#0C1712";');
  if (!s.includes('const surface      =')) s = s.replace('const cardBg          = "rgba(255,255,255,0.072)";', 'const surface         = surface2;\nconst cardBg          = "rgba(255,255,255,0.072)";');
  if (!s.includes('const border        =')) s = s.replace('const dividerSoft    = "rgba(255,255,255,0.055)";', 'const dividerSoft    = "rgba(255,255,255,0.055)";\nconst border          = "rgba(255,255,255,0.115)";');
  if (!s.includes('const glassStrong')) s = s.replace('const glassCard       = "rgba(255,255,255,0.082)";', 'const glassCard       = "rgba(255,255,255,0.082)";\nconst glassStrong     = "rgba(255,255,255,0.135)";\nconst glassMuted      = "rgba(255,255,255,0.045)";');

  s = s.replace('medical:      { primary: "#EF4444", deep: "#B91C1C", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#EF4444", "#DC2626"] },', 'medical:      { primary: "#6CA6A6", deep: "#417979", light: "#A7D5D5", soft: "rgba(108,166,166,0.14)", grad: ["#6CA6A6", "#417979"] },');
  s = s.replace('women:        { primary: "#EC4899", deep: "#BE185D", light: "#F9A8D4", soft: "#FCE7F3", grad: ["#EC4899", "#DB2777"] },', 'women:        { primary: "#1FA971", deep: "#0E7C55", light: "#68D7A6", soft: "rgba(31,169,113,0.14)", grad: ["#1FA971", "#0E7C55"] },');
  s = s.replace('market:       { primary: "#FB923C", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#FB923C", "#F97316"] },', 'market:       { primary: "#F4B400", deep: "#B98500", light: "#FFD766", soft: "rgba(244,180,0,0.14)", grad: ["#F4B400", "#B98500"] },');
  s = s.replace('social:       { primary: "#8B5CF6", deep: "#6D28D9", light: "#C4B5FD", soft: "#EDE9FE", grad: ["#8B5CF6", "#7C3AED"] },', 'social:       { primary: "#6CA6A6", deep: "#417979", light: "#A7D5D5", soft: "rgba(108,166,166,0.14)", grad: ["#6CA6A6", "#417979"] },');
  s = s.replace('transport:    { primary: "#FACC15", deep: "#A16207", light: "#FDE047", soft: "#FEF9C3", grad: ["#FACC15", "#EAB308"] },', 'transport:    { primary: "#F4B400", deep: "#B98500", light: "#FFD766", soft: "rgba(244,180,0,0.14)", grad: ["#F4B400", "#B98500"] },');

  s = s.replace('hero:       ["#22C55E", "#16A34A", "#040C07"] as [string, string, string],', 'hero:       ["#10261B", "#0B1712", "#050A08"] as [string, string, string],');
  s = s.replace('dark:       ["#0D2211", "#07110A", "#040C07"] as [string, string, string],', 'dark:       ["#102018", "#08110D", "#050A08"] as [string, string, string],');
  s = s.replace('glass:      ["rgba(255,255,255,0.05)", "rgba(255,255,255,0.01)"] as [string, string],', 'glass:      ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.035)"] as [string, string],');

  s = s.replace('bg,\n  bgDeep,', 'bg,\n  bgDeep,\n  bgAlt,');
  s = s.replace('surface1,', 'surface,\n  surface1,');
  s = s.replace('glassCard,\n  overlay,', 'glassCard,\n  glassStrong,\n  glassMuted,\n  overlay,');
  s = s.replace('divider,\n  dividerSoft,', 'divider,\n  dividerSoft,\n  border,');
  return s;
});

patchFile('app/(tabs)/index.tsx', (src) => {
  let s = src;
  const replacements = [
    ['color: "#FF4FA3"', 'color: Colors.primary'],
    ['color: "#A855F7"', 'color: Colors.softBlue'],
    ['color: "#FF6B35"', 'color: Colors.accent'],
    ['color: "#27AE68"', 'color: Colors.primary'],
    ['color: "#3E9CBF"', 'color: Colors.softBlue'],
    ['bg: "#FF4FA320"', 'bg: Colors.primary+"18"'],
    ['bg: "#A855F720"', 'bg: Colors.softBlue+"18"'],
    ['bg: "#FF6B3520"', 'bg: Colors.accent+"18"'],
    ['bg: "#27AE6820"', 'bg: Colors.primary+"18"'],
    ['bg: "#3E9CBF20"', 'bg: Colors.softBlue+"18"'],
    ['backgroundColor: "rgba(10,31,54,0.80)"', 'backgroundColor: Colors.glassCard'],
    ['backgroundColor: "rgba(10,31,54,0.70)"', 'backgroundColor: Colors.glassCard'],
    ['borderColor: "rgba(255,255,255,0.07)"', 'borderColor: Colors.borderSubtle'],
    ['color: "rgba(240,249,255,0.93)"', 'color: Colors.textPrimary'],
    ['color: "rgba(186,230,253,0.55)"', 'color: Colors.textMuted'],
    ['color: "rgba(240,249,255,0.94)"', 'color: Colors.textPrimary'],
    ['color: "rgba(186,230,253,0.60)"', 'color: Colors.textMuted'],
  ];
  for (const [a,b] of replacements) s = s.replaceAll(a,b);
  return s;
});

console.log(changed ? 'glass minimal UI applied' : 'glass minimal UI already applied');
