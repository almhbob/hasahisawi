import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";
import uploadRouter from "./upload";
import institutionApplicationsRouter from "./institution-applications";
import accountFixesRouter from "./account-fixes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);
router.use(accountFixesRouter);
router.use(institutionApplicationsRouter);
router.use(hasahisawiRouter);

initHasahisawiDb().catch(console.error);

export default router;
