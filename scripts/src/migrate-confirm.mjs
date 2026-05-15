#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const PAGES_DIR = "artifacts/admin-dashboard/src/pages";
const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".tsx"));

const stats = { changed: 0, skipped: 0, replacements: 0, files: [] };

for (const fname of files) {
  const fpath = path.join(PAGES_DIR, fname);
  let src = fs.readFileSync(fpath, "utf8");
  const orig = src;

  const re = /if\s*\(\s*!\s*confirm\(\s*(`[^`]+`|"[^"]+"|'[^']+')\s*\)\s*\)\s*return\s*;?/g;
  const matches = [...src.matchAll(re)];
  if (matches.length === 0) continue;

  const hasUseConfirm = /useConfirm\s*\(/.test(src);
  const hasImport = /from\s+["']@\/components\/ConfirmDialog["']/.test(src);

  for (const m of matches) {
    const raw = m[1];
    const inner = raw.slice(1, -1);
    const isTemplate = raw.startsWith("`");
    const descExpr = isTemplate ? raw : JSON.stringify(inner);
    const isDelete = /حذف|إزالة|إلغاء/.test(inner);
    const isReject = /رفض/.test(inner);
    const confirmText = isDelete ? "حذف" : isReject ? "رفض" : "متابعة";
    const destructive = isDelete || isReject;
    const title = isDelete ? "تأكيد الحذف" : isReject ? "تأكيد الرفض" : "تأكيد";
    const replacement = `if (!(await confirm({ title: ${JSON.stringify(title)}, description: ${descExpr}, confirmText: ${JSON.stringify(confirmText)}, destructive: ${destructive} }))) return;`;
    src = src.replace(m[0], replacement);
    stats.replacements++;
  }

  if (!hasImport) {
    src = src.replace(
      /(import\s+\{\s*[^}]*\}\s+from\s+["']@\/lib\/api["'];?\n)/,
      `$1import { useConfirm } from "@/components/ConfirmDialog";\n`
    );
    if (!/from\s+["']@\/components\/ConfirmDialog["']/.test(src)) {
      const lastImportMatch = [...src.matchAll(/^import .+;$/gm)].pop();
      if (lastImportMatch) {
        const idx = lastImportMatch.index + lastImportMatch[0].length;
        src = src.slice(0, idx) + `\nimport { useConfirm } from "@/components/ConfirmDialog";` + src.slice(idx);
      }
    }
  }

  if (!hasUseConfirm) {
    src = src.replace(
      /(export default function\s+\w+\s*\([^)]*\)\s*\{\s*\n)/,
      `$1  const confirm = useConfirm();\n`
    );
  }

  if (src !== orig) {
    fs.writeFileSync(fpath, src, "utf8");
    stats.changed++;
    stats.files.push(`${fname} (${matches.length})`);
  } else {
    stats.skipped++;
  }
}

console.log(JSON.stringify(stats, null, 2));
