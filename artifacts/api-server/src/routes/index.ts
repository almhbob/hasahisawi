import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminUsersFirebaseRouter from "./admin-users-firebase";
import travelAgenciesRouter, { initTravelAgenciesDb } from "./travel-agencies";
import extraRouter, { initExtraDb } from "./extra";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);
router.use(adminUsersFirebaseRouter);
router.use(travelAgenciesRouter);
router.use(extraRouter);
router.use(hasahisawiRouter);

initTravelAgenciesDb().catch(console.error);
initExtraDb().catch(console.error);
initHasahisawiDb().catch(console.error);

export default router;
