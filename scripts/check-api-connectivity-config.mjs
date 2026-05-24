import { readFileSync, existsSync } from 'node:fs';

const checks = [];
function ok(name, pass, detail = '') {
  checks.push({ name, pass, detail });
}
function read(path) {
  return readFileSync(path, 'utf8');
}

const mobileClientPath = 'artifacts/hasahisawi/lib/query-client.ts';
const adminApiPath = 'artifacts/admin-dashboard/src/lib/api.ts';
const healthPath = 'artifacts/api-server/src/routes/health.ts';
const appPath = 'artifacts/api-server/src/app.ts';
const travelApiPath = 'artifacts/api-server/src/routes/travel-agencies.ts';
const adminAgencyPagePath = 'artifacts/admin-dashboard/src/pages/TravelAgencyApplications.tsx';

for (const path of [mobileClientPath, adminApiPath, healthPath, appPath, travelApiPath, adminAgencyPagePath]) {
  ok(`file exists: ${path}`, existsSync(path));
}

const mobile = read(mobileClientPath);
ok('mobile reads EXPO_PUBLIC_API_URL', mobile.includes('EXPO_PUBLIC_API_URL'));
ok('mobile reads EXPO_PUBLIC_API_BASE_URL', mobile.includes('EXPO_PUBLIC_API_BASE_URL'));
ok('mobile has production default API URL', mobile.includes('DEFAULT_PRODUCTION_API_URL'));
ok('mobile health check uses readyz', mobile.includes('/api/readyz'));
ok('mobile health check falls back to healthz', mobile.includes('/api/healthz'));
ok('mobile normalizes missing leading slash', mobile.includes('route.startsWith("/")') || mobile.includes("route.startsWith('/')"));

const admin = read(adminApiPath);
ok('admin dashboard supports VITE_API_BASE_URL', admin.includes('VITE_API_BASE_URL'));
ok('admin dashboard prefixes local API with /api', admin.includes('`/api${path}`'));
ok('admin dashboard sends Authorization Bearer token', admin.includes('Authorization') && admin.includes('Bearer'));

const health = read(healthPath);
ok('server exposes /readyz', health.includes('"/readyz"') || health.includes("'/readyz'"));
ok('server exposes /healthz/full', health.includes('"/healthz/full"') || health.includes("'/healthz/full'"));
ok('server readyz checks database', health.includes('databaseStatus'));
ok('server readyz checks firebase env', health.includes('firebaseEnvStatus'));

const app = read(appPath);
ok('server mounts router under /api', app.includes('app.use("/api", router)') || app.includes("app.use('/api', router)"));
ok('server direct routes disabled in production', app.includes('process.env.NODE_ENV !== "production"') || app.includes("process.env.NODE_ENV !== 'production'"));

const travelApi = read(travelApiPath);
for (const route of [
  '/travel-agencies',
  '/travel-agencies/apply',
  '/admin/travel-agencies/applications',
  '/admin/travel-agencies/applications/:id/status',
  '/admin/travel-agencies/applications/:id/approve',
]) {
  ok(`travel agency API route present: ${route}`, travelApi.includes(route));
}
ok('travel agency apply uses write limiter', travelApi.includes('heavyWriteLimiter'));
ok('travel agency admin accepts Bearer admin session', travelApi.includes('Authorization') && travelApi.includes('user_sessions'));

const agencyPage = read(adminAgencyPagePath);
ok('admin agency page calls applications endpoint', agencyPage.includes('/admin/travel-agencies/applications'));
ok('admin agency page calls approve endpoint', agencyPage.includes('/approve'));
ok('admin agency page can change status', agencyPage.includes('/status'));

const failed = checks.filter(c => !c.pass);
for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` - ${c.detail}` : ''}`);
}

if (failed.length) {
  console.error(`\nAPI connectivity prelaunch check failed: ${failed.length} issue(s).`);
  process.exit(1);
}

console.log('\nAPI connectivity prelaunch check passed.');
