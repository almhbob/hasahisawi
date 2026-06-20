import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'src/pages/ApplicationsArchive.tsx');
let src = readFileSync(file, 'utf8');
let changed = false;
const rep = (a, b) => { if (src.includes(a)) { src = src.replace(a, b); changed = true; } };

rep('import { apiJson } from "@/lib/api";', 'import { apiFetch, apiJson } from "@/lib/api";');

rep(`      const [merchantsRes, driversRes, travelRes, womenRes] = await Promise.allSettled([
        apiJson<any>("/admin/merchants"),
        apiJson<any[]>("/admin/transport/drivers"),
        apiJson<any>("/admin/travel-agencies/applications"),
        apiJson<any>("/admin/women-services"),
      ]);`, `      const [merchantsRes, driversRes, travelRes, womenRes, archiveRes] = await Promise.allSettled([
        apiJson<any>("/admin/merchants"),
        apiJson<any[]>("/admin/transport/drivers"),
        apiJson<any>("/admin/travel-agencies/applications"),
        apiJson<any>("/admin/women-services"),
        apiJson<any>("/admin/join-application-archives"),
      ]);`);

rep(`      next.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setRecords(next);
      toast.success(\`تم تحميل ${'${next.length}'} استمارة\`);`, `      next.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setRecords(next);
      if (archiveRes.status === "fulfilled" && Array.isArray(archiveRes.value?.archives)) {
        const serverSnapshots = archiveRes.value.archives.map((a: any) => ({
          id: a.snapshot_id || String(a.id),
          created_at: a.created_at,
          count: Number(a.total_count || 0),
          pending: Number(a.pending_count || 0),
          records: [],
        }));
        const local = readSnapshots();
        const merged = [...serverSnapshots, ...local].filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i).slice(0, 25);
        setSnapshots(merged);
        saveSnapshots(merged);
      }
      toast.success(\`تم تحميل ${'${next.length}'} استمارة\`);`);

rep(`  function archiveCurrent() {
    const snapshot: Snapshot = {
      id: \`archive-${'${Date.now()}'}\`,
      created_at: new Date().toISOString(),
      count: records.length,
      pending: pendingCount,
      records,
    };
    const next = [snapshot, ...snapshots];
    setSnapshots(next);
    saveSnapshots(next);
    toast.success("تمت أرشفة لقطة جديدة داخل الإدارة");
  }`, `  async function archiveCurrent() {
    const snapshot: Snapshot = {
      id: \`archive-${'${Date.now()}'}\`,
      created_at: new Date().toISOString(),
      count: records.length,
      pending: pendingCount,
      records,
    };
    const next = [snapshot, ...snapshots];
    setSnapshots(next);
    saveSnapshots(next);
    try {
      const res = await apiFetch("/admin/join-application-archives", {
        method: "POST",
        body: JSON.stringify({ snapshot_id: snapshot.id, records, note: "manual-dashboard-archive" }),
      });
      if (res.ok) toast.success("تمت أرشفة اللقطة في قاعدة البيانات");
      else toast.warning("حُفظت اللقطة محلياً، وتعذر حفظها في الخادم");
    } catch {
      toast.warning("حُفظت اللقطة محلياً، وتعذر حفظها في الخادم");
    }
  }`);

if (changed) writeFileSync(file, src);
console.log(changed ? 'archive DB persistence applied' : 'archive DB persistence already applied');
