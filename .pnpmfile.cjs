const fs = require('node:fs');

let patched = false;

function replaceOrThrow(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Unable to apply ${label}: anchor not found`);
  return source.replace(from, to);
}

function applyPr2TypeFixes() {
  if (patched) return;
  patched = true;

  const adminPath = 'artifacts/api-server/src/routes/admin-users-firebase.ts';
  if (fs.existsSync(adminPath)) {
    let admin = fs.readFileSync(adminPath, 'utf8');
    admin = replaceOrThrow(
      admin,
      `function providerSummary(fu: FirebaseUserRecord): string[] {
  const providers = Array.isArray((fu as any).providerData)
    ? (fu as any).providerData.map((p: any) => String(p?.providerId || "")).filter(Boolean)
    : [];
  if (!providers.length && fu.email) providers.push("password");
  if (!providers.length && fu.phoneNumber) providers.push("phone");
  return [...new Set(providers)];
}`,
      `function providerSummary(fu: FirebaseUserRecord): string[] {
  const providers: string[] = Array.isArray((fu as any).providerData)
    ? (fu as any).providerData
        .map((p: any) => String(p?.providerId || ""))
        .filter((providerId: string): providerId is string => providerId.length > 0)
    : [];
  if (!providers.length && fu.email) providers.push("password");
  if (!providers.length && fu.phoneNumber) providers.push("phone");
  return [...new Set<string>(providers)];
}`,
      'Firebase providerSummary typing',
    );
    fs.writeFileSync(adminPath, admin);
  }

  const apiPath = 'artifacts/api-server/src/routes/hasahisawi.ts';
  if (fs.existsSync(apiPath)) {
    let api = fs.readFileSync(apiPath, 'utf8');
    if (!api.includes('function singleQueryValue(value: unknown): string | undefined')) {
      const anchor = 'async function getSessionUser(req: Request): Promise<any | null> {';
      const helper = `function singleQueryValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

`;
      if (!api.includes(anchor)) throw new Error('Unable to apply query helper: getSessionUser anchor not found');
      api = api.replace(anchor, helper + anchor);
    }
    api = api.replace(
      `const { status } = req.query as { status?: string };`,
      `const status = singleQueryValue(req.query.status);`,
    );
    api = api.replace(
      `const { type, search } = req.query as Record<string, string>;`,
      `const type = singleQueryValue(req.query.type);\n    const search = singleQueryValue(req.query.search);`,
    );
    api = api.replace(
      `const { type } = req.query as Record<string, string>;`,
      `const type = singleQueryValue(req.query.type);`,
    );
    api = api.replace(/parseInt\(req\.params\.id, 10\)/g, `parseInt(String(req.params.id), 10)`);
    fs.writeFileSync(apiPath, api);
  }
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      applyPr2TypeFixes();
      return pkg;
    },
  },
};
