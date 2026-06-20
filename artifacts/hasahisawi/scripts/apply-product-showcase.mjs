import { readFileSync, writeFileSync } from 'node:fs';

function patchFile(relativePath, audience) {
  const file = new URL(relativePath, import.meta.url);
  let src = readFileSync(file, 'utf8');
  const before = src;

  if (!src.includes('@/components/ProductShowcase')) {
    src = src.replace('import OrgInviteCard from "@/components/OrgInviteCard";', 'import OrgInviteCard from "@/components/OrgInviteCard";\nimport ProductShowcase from "@/components/ProductShowcase";');
  }

  const marker = audience === 'women'
    ? '            <View style={fs.featureGrid}>'
    : '        {filtered.map((shop, index) => {';

  const insert = audience === 'women'
    ? '            <ProductShowcase audience="women" />\n\n            <View style={fs.featureGrid}>'
    : '        <ProductShowcase audience="men" />\n\n        {filtered.map((shop, index) => {';

  if (!src.includes(`<ProductShowcase audience="${audience}" />`) && src.includes(marker)) {
    src = src.replace(marker, insert);
  }

  if (src !== before) {
    writeFileSync(file, src);
    console.log(`[product-showcase] applied to ${relativePath}`);
  } else {
    console.log(`[product-showcase] ${relativePath} already patched or marker missing`);
  }
}

patchFile('../app/(tabs)/women.tsx', 'women');
patchFile('../app/(tabs)/men.tsx', 'men');
