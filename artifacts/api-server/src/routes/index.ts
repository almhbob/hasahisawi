import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminUsersFirebaseRouter from "./admin-users-firebase";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);

// Register the professional admin-users routes before the legacy monolithic
// router so `/admin/users` and `/admin/sync-firebase-users` are handled here.
router.use(adminUsersFirebaseRouter);
router.use(hasahisawiRouter);

// Run DB init eagerly — not via setImmediate — so tables exist before any request
initHasahisawiDb().catch(console.error);

export default router;