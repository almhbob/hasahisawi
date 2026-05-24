import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminUsersFirebaseRouter from "./admin-users-firebase";
import travelAgenciesRouter, { initTravelAgenciesDb } from "./travel-agencies";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);

// Register dedicated routes before the legacy monolithic router.
router.use(adminUsersFirebaseRouter);
router.use(travelAgenciesRouter);
router.use(hasahisawiRouter);

// Run DB init eagerly — not via setImmediate — so tables exist before any request
initTravelAgenciesDb().catch(console.error);
initHasahisawiDb().catch(console.error);

export default router;