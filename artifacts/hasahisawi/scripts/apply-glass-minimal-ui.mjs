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

function replaceAll(source, pairs) {
  let out = source;
  for (const [from, to] of pairs) out = out.split(from).join(to);
  return out;
}

// Guard against older patches reintroducing non-logo colors in the home launcher.
patchFile('app/(tabs)/index.tsx', (src) => replaceAll(src, [
  ['color: "#6CA6A6"', 'color: Colors.primary'],
  ['color: "#D49A2A"', 'color: Colors.accent'],
  ['color: "#9AA7A0"', 'color: Colors.primary'],
  ['color: "#1FA971"', 'color: Colors.primary'],
  ['color: "#14B8A6"', 'color: Colors.primary'],
  ['color: "#C96F6F"', 'color: Colors.accent'],
  ['color: "#F97316"', 'color: Colors.accent'],
  ['color: "#FF4FA3"', 'color: Colors.primary'],
  ['color: "#A855F7"', 'color: Colors.primary'],
  ['color: "#FF6B35"', 'color: Colors.accent'],
  ['color: "#27AE68"', 'color: Colors.primary'],
  ['color: "#3E9CBF"', 'color: Colors.primary'],
  ['bg: "#F9731620"', 'bg: Colors.accent+"18"'],
  ['bg: "#14B8A620"', 'bg: Colors.primary+"18"'],
  ['bg: "#FF4FA320"', 'bg: Colors.primary+"18"'],
  ['bg: "#A855F720"', 'bg: Colors.primary+"18"'],
  ['bg: "#FF6B3520"', 'bg: Colors.accent+"18"'],
  ['bg: "#27AE6820"', 'bg: Colors.primary+"18"'],
  ['bg: "#3E9CBF20"', 'bg: Colors.primary+"18"'],
]));

// Keep Expo visible surfaces and notification lights locked to logo colors.
patchFile('app.json', (src) => {
  let out = src;
  try {
    const json = JSON.parse(src);
    const expo = json.expo ?? {};
    expo.userInterfaceStyle = 'light';
    expo.splash = { ...(expo.splash ?? {}), backgroundColor: '#FFFFFF' };
    expo.web = {
      ...(expo.web ?? {}),
      themeColor: '#009B67',
      backgroundColor: '#F7FFF9',
    };
    const notifications = expo.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications');
    if (notifications?.[1]) {
      notifications[1].color = '#009B67';
      for (const channel of notifications[1].androidChannels ?? []) {
        const name = String(channel.name ?? '');
        channel.lightColor = name.includes('عاجلة') || name.includes('الصلاة') ? '#FFC20A' : '#009B67';
      }
    }
    out = JSON.stringify(json, null, 2) + '\n';
  } catch {
    out = src;
  }
  return out;
});

// The design token file itself is the source of truth. Do not mutate it here;
// this script only prevents legacy scripts from drifting away from logo-only UI.
console.log(changed ? 'logo-only glass UI guard applied' : 'logo-only glass UI already clean');
