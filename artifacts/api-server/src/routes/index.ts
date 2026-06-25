import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminUsersFirebaseRouter from "./admin-users-firebase";
import travelAgenciesRouter, { initTravelAgenciesDb } from "./travel-agencies";
import extraRouter, { initExtraDb } from "./extra";
import lawyersAdminRouter, { ensureLawyersDb } from "./lawyers-admin";
import transportLiveRouter, { initTransportLiveDb } from "./transport-live";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";
import uploadRouter from "./upload";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);
router.use(adminUsersFirebaseRouter);
router.use(travelAgenciesRouter);
router.use(extraRouter);
// المحامون أولاً حتى تعمل الإدارة والاشتراكات حتى لو كانت المسارات القديمة ناقصة.
router.use(lawyersAdminRouter);
// النقل الحي قبل الراوتر العام حتى تكون طلبات السائقين وقبول الرحلات ذرّية وواضحة.
router.use(transportLiveRouter);
router.use(hasahisawiRouter);

initTravelAgenciesDb().catch(console.error);
initExtraDb().catch(console.error);
ensureLawyersDb().catch(console.error);
initTransportLiveDb().catch(console.error);
initHasahisawiDb().catch(console.error);

export default router;
