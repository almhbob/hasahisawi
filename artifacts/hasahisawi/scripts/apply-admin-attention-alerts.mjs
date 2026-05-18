import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'app/admin.tsx');
let src = fs.readFileSync(file, 'utf8');

const importLine = 'import BrandPattern from "@/components/BrandPattern";';
const alertImport = 'import { alertForNewPendingAdminItems, countPendingAdminItems } from "@/lib/attention-alerts";';
if (!src.includes(alertImport)) {
  src = src.replace(importLine, `${importLine}\n${alertImport}`);
}

const markerState = 'const [updatingTripId,    setUpdatingTripId]    = useState<number | null>(null);';
const injectedState = `${markerState}\n  const [lastPendingAdminCount, setLastPendingAdminCount] = useState(0);`;
if (!src.includes('lastPendingAdminCount')) {
  src = src.replace(markerState, injectedState);
}

const anchor = 'const isAdmin = user?.role === "admin";';
const injectedEffect = `useEffect(() => {\n    const current = countPendingAdminItems({\n      ads: adsList,\n      communities: communitiesList,\n      serviceRequests: svcRequests,\n      drivers: transportDrivers,\n      trips: transportTrips,\n    });\n\n    alertForNewPendingAdminItems(lastPendingAdminCount, current);\n    setLastPendingAdminCount(current);\n  }, [adsList, communitiesList, svcRequests, transportDrivers, transportTrips]);\n\n  ${anchor}`;
if (!src.includes('countPendingAdminItems({')) {
  src = src.replace(anchor, injectedEffect);
}

fs.writeFileSync(file, src);
console.log('Admin attention alerts patch applied');
