#!/usr/bin/env node
// Prepare the static web export for Vercel.
//
// Vercel never uploads directories named `node_modules`, but Expo's web export
// places icon fonts (Ionicons, Feather, ...) and the Cairo font under
// `assets/__node_modules/.pnpm/<pkg>/node_modules/...`. On Vercel those files
// 404 and every icon renders as an empty box.
//
// This copies the export to a new directory, renames every nested
// `node_modules` directory to `nm`, and rewrites the matching URL segments in
// the bundles so the fonts resolve again.
//
// Usage: node scripts/prepare-vercel-web.mjs <srcDir> <outDir>

import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [src = "cf-dist", out = "vercel-dist"] = process.argv.slice(2);
if (!existsSync(src)) {
  console.error(`Source directory not found: ${src}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

// 1) Rename nested node_modules dirs (deepest first so parent paths stay valid).
const renamed = [];
function collect(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    collect(p);
    if (name === "node_modules") renamed.push(p);
  }
}
collect(out);
for (const p of renamed) renameSync(p, join(p, "..", "nm"));

// 2) Rewrite URL segments in text assets.
const TEXT = /\.(js|mjs|css|html|json|map|webmanifest)$/i;
let filesChanged = 0;
let replacements = 0;
function rewrite(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { rewrite(p); continue; }
    if (!TEXT.test(name)) continue;
    const before = readFileSync(p, "utf8");
    if (!before.includes("/node_modules/")) continue;
    // Only touch asset URLs under /assets/__node_modules/… so unrelated strings stay intact.
    const after = before.replace(/(assets\/__node_modules\/[^"'`\s)]*?)\/node_modules\//g, (_m, head) => {
      replacements++;
      return `${head}/nm/`;
    });
    if (after !== before) {
      writeFileSync(p, after);
      filesChanged++;
    }
  }
}
rewrite(out);

// 3) Sanity check: no font/asset reference may still point at a node_modules path.
let leftovers = 0;
function verify(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { verify(p); continue; }
    if (!TEXT.test(name)) continue;
    const m = readFileSync(p, "utf8").match(/assets\/__node_modules\/[^"'`\s)]*\/node_modules\//g);
    if (m) leftovers += m.length;
  }
}
verify(out);

console.log(`Renamed ${renamed.length} node_modules dirs, rewrote ${replacements} URLs in ${filesChanged} files.`);
if (leftovers) {
  console.error(`Found ${leftovers} unresolved node_modules asset URLs`);
  process.exit(1);
}
