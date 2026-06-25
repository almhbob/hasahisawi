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
    console.log(`[lawyer-admin-links] patched ${path}`);
  } else {
    console.log(`[lawyer-admin-links] ${path} already clean`);
  }
}

patchFile('src/components/Layout.tsx', (src) => {
  let out = src;
  if (!out.includes('path: "/lawyer-applications"')) {
    out = out.replace(
      '  { path: "/lawyers",        label: "المحامون",            icon: "⚖️" },',
      '  { path: "/lawyers",        label: "المحامون",            icon: "⚖️" },\n  { path: "/lawyer-applications", label: "طلبات انضمام المحامين", icon: "📥" },',
    );
  }
  if (!out.includes('path: "/lawyer-subscriptions"')) {
    out = out.replace(
      '  { path: "/lawyers",        label: "المحامون",            icon: "⚖️" },',
      '  { path: "/lawyers",        label: "المحامون",            icon: "⚖️" },\n  { path: "/lawyer-subscriptions", label: "اشتراكات المحامين", icon: "💳" },',
    );
  }
  return out;
});

patchFile('src/App.tsx', (src) => {
  let out = src;
  if (!out.includes('LawyerSubscriptions')) {
    out = out.replace(
      'import LawyersAdmin   from "@/pages/Lawyers";',
      'import LawyersAdmin   from "@/pages/Lawyers";\nimport LawyerSubscriptions from "@/pages/LawyerSubscriptions";',
    );
  }
  if (!out.includes('path="/lawyer-applications"')) {
    out = out.replace(
      '        <Route path="/lawyers"        component={LawyersAdmin} />',
      '        <Route path="/lawyers"        component={LawyersAdmin} />\n        <Route path="/lawyer-applications" component={LawyersAdmin} />',
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

patchFile('src/pages/Lawyers.tsx', (src) => {
  let out = src;

  out = out.replace(
    '  id: number; full_name: string; title: string; phone: string; specialties: string;\n  district: string; consult_fee: string; experience_y: number;',
    '  id: number; full_name: string; title: string; phone: string; specialties: string;\n  whatsapp?: string; email?: string; office_addr?: string; bar_number?: string; languages?: string; photo_url?: string;\n  district: string; consult_fee: string; experience_y: number;',
  );

  out = out.replace(
    '    try { setLawyers(Array.isArray(await apiJson<Lawyer[]>("/admin/lawyers")) ? await apiJson<Lawyer[]>("/admin/lawyers") : []); }',
    '    try {\n      const data = await apiJson<Lawyer[]>("/admin/lawyers");\n      setLawyers(Array.isArray(data) ? data : []);\n    }',
  );

  out = out.replace(
    '      phone: l.phone || "", whatsapp: "", email: "", office_addr: "", district: l.district || "",\n      consult_fee: l.consult_fee || "", experience_y: l.experience_y || 0,',
    '      phone: l.phone || "", whatsapp: l.whatsapp || "", email: l.email || "", office_addr: l.office_addr || "", district: l.district || "",\n      consult_fee: l.consult_fee || "", experience_y: l.experience_y || 0,',
  );

  return out;
});
