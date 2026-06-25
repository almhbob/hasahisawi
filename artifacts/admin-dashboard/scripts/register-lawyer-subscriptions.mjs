import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function patchFile(path, patcher) {
  const file = resolve(root, path);
  const before = readFileSync(file, 'utf8');
  const after = patcher(before);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`[lawyer-subscriptions] patched ${path}`);
  } else {
    console.log(`[lawyer-subscriptions] ${path} already clean`);
  }
}

patchFile('src/components/Layout.tsx', (src) => {
  if (src.includes('path: "/lawyer-subscriptions"')) return src;
  return src.replace(
    '  { path: "/lawyers",        label: "المحامون",            icon: "⚖️" },',
    '  { path: "/lawyers",        label: "المحامون",            icon: "⚖️" },\n  { path: "/lawyer-subscriptions", label: "اشتراكات المحامين", icon: "💳" },',
  );
});

patchFile('src/App.tsx', (src) => {
  let out = src;
  if (!out.includes('LawyerSubscriptions')) {
    out = out.replace(
      'import LawyersAdmin   from "@/pages/Lawyers";',
      'import LawyersAdmin   from "@/pages/Lawyers";\nimport LawyerSubscriptions from "@/pages/LawyerSubscriptions";',
    );
  }
  if (!out.includes('path="/lawyer-subscriptions"')) {
    out = out.replace(
      '        <Route path="/lawyers"        component={LawyersAdmin} />',
      '        <Route path="/lawyers"        component={LawyersAdmin} />\n        <Route path="/lawyer-subscriptions" component={LawyerSubscriptions} />',
    );
  }
  return out;
});
