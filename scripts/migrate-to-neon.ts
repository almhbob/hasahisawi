/**
 * سكريبت نقل البيانات من Replit PostgreSQL إلى Neon
 * 
 * الاستخدام:
 *   npx tsx scripts/migrate-to-neon.ts
 * 
 * المتطلبات:
 *   - NEON_DATABASE_URL: connection string من neon.tech
 *   - DATABASE_URL:      connection string من Replit (موجود مسبقاً)
 */

import { Pool } from "pg";

const SOURCE_URL = process.env.DATABASE_URL;
const TARGET_URL = process.env.NEON_DATABASE_URL;

if (!SOURCE_URL || !TARGET_URL) {
  console.error("❌ يجب تعيين DATABASE_URL و NEON_DATABASE_URL");
  process.exit(1);
}

const source = new Pool({ connectionString: SOURCE_URL });
const target = new Pool({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

const TABLES = [
  "users",
  "admin_settings",
  "user_sessions",
  "ads",
  "social_posts",
  "social_comments",
  "social_likes",
  "notifications",
  "push_tokens",
  "city_news",
  "jobs",
  "merchant_spaces",
  "lost_items",
  "emergency_numbers",
  "city_landmarks",
  "honored_figures",
  "specialists",
  "map_places",
  "communities",
  "organizations",
  "sports_posts",
  "citizen_reports",
  "women_services",
  "events",
  "feedback",
  "chats",
  "chat_messages",
  "moderator_permissions",
];

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`,
    [tableName]
  );
  return result.rows[0].exists;
}

async function migrateTable(tableName: string) {
  const srcExists = await tableExists(source, tableName);
  if (!srcExists) {
    console.log(`  ⏭️  ${tableName} — غير موجود في المصدر`);
    return;
  }

  const rows = await source.query(`SELECT * FROM ${tableName}`);
  if (rows.rows.length === 0) {
    console.log(`  ✅ ${tableName} — فارغ (0 صفوف)`);
    return;
  }

  // حذف البيانات الموجودة في الهدف ثم إدراج البيانات من المصدر
  await target.query(`TRUNCATE TABLE ${tableName} CASCADE`);

  const columns = Object.keys(rows.rows[0]);
  const placeholders = rows.rows.map(
    (_row, i) => `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(",")})`
  );

  const BATCH = 50;
  for (let i = 0; i < rows.rows.length; i += BATCH) {
    const batch = rows.rows.slice(i, i + BATCH);
    const batchPlaceholders = batch.map(
      (_row, bi) => `(${columns.map((_, j) => `$${bi * columns.length + j + 1}`).join(",")})`
    );
    const values = batch.flatMap((row) => columns.map((col) => row[col]));
    await target.query(
      `INSERT INTO ${tableName} (${columns.map(c => `"${c}"`).join(",")}) VALUES ${batchPlaceholders.join(",")} ON CONFLICT DO NOTHING`,
      values
    );
  }

  console.log(`  ✅ ${tableName} — ${rows.rows.length} صف`);
}

async function resetSequences() {
  const seqResult = await target.query(`
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  `);

  for (const { sequence_name } of seqResult.rows) {
    const tableName = sequence_name.replace(/_id_seq$/, "").replace(/_seq$/, "");
    try {
      await target.query(`SELECT setval('${sequence_name}', COALESCE((SELECT MAX(id) FROM "${tableName}"), 1))`);
    } catch {
      // تجاهل الجداول غير الموجودة
    }
  }
  console.log("✅ تم إعادة ضبط sequences");
}

async function main() {
  console.log("🚀 بدء نقل البيانات...\n");
  console.log("📥 المصدر:  Replit PostgreSQL");
  console.log("📤 الهدف:   Neon PostgreSQL\n");

  for (const table of TABLES) {
    process.stdout.write(`  🔄 ${table}...`);
    try {
      await migrateTable(table);
    } catch (err: unknown) {
      console.log(`  ⚠️  ${table} — ${(err as Error).message}`);
    }
  }

  await resetSequences();

  console.log("\n✅ اكتمل نقل البيانات!");
  console.log("\n📌 الخطوة التالية: ابنِ وانشر Firebase Functions:");
  console.log("   cd artifacts/firebase-functions && npm install");
  console.log("   firebase login");
  console.log('   firebase functions:secrets:set DATABASE_URL');
  console.log("   firebase deploy --only functions");

  await source.end();
  await target.end();
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
