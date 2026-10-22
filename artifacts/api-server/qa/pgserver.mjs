import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5432, host: "127.0.0.1", maxConnections: 100 });
await server.start();
console.log("pglite on 5432");
process.on("SIGTERM", async () => { await server.stop(); process.exit(0); });
