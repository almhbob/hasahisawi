import { Router, type IRouter } from "express";
import healthRouter from "./health";
import securityHardeningRouter from "./security-hardening";
import adminUsersFirebaseRouter from "./admin-users-firebase";
import travelAgenciesRouter, { initTravelAgenciesDb } from "./travel-agencies";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(securityHardeningRouter);
router.use(uploadRouter);

// Register dedicated routes before the monolithic router.
router.use(adminUsersFirebaseRouter);
router.use(travelAgenciesRouter);
router.use(hasahisawiRouter);

// Run DB init eagerly so tables exist before any request.
initTravelAgenciesDb().catch((err) => console.error(err));
initHasahisawiDb().catch((err) => console.error(err));

export default router;
