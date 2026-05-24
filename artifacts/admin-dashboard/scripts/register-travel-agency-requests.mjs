import { readFileSync, writeFileSync } from 'node:fs';

const appPath = new URL('../src/App.tsx', import.meta.url);
let app = readFileSync(appPath, 'utf8');

if (!app.includes('TravelAgencyApplications')) {
  app = app.replace(
    'import TravelAdmin     from "@/pages/Travel";',
    'import TravelAdmin     from "@/pages/Travel";\nimport TravelAgencyApplications from "@/pages/TravelAgencyApplications";'
  );
  app = app.replace(
    '<Route path="/travel"         component={TravelAdmin} />',
    '<Route path="/travel"         component={TravelAdmin} />\n        <Route path="/travel-agency-requests" component={TravelAgencyApplications} />'
  );
  writeFileSync(appPath, app);
}

const layoutPath = new URL('../src/components/Layout.tsx', import.meta.url);
let layout = readFileSync(layoutPath, 'utf8');

if (!layout.includes('/travel-agency-requests')) {
  layout = layout.replace(
    '{ path: "/travel",        label: "تذاكر السفر",        icon: "✈️" },',
    '{ path: "/travel",        label: "تذاكر السفر",        icon: "✈️" },\n  { path: "/travel-agency-requests", label: "طلبات وكالات السفر", icon: "🧳" },'
  );
  writeFileSync(layoutPath, layout);
}

console.log('travel agency requests route registration complete');
