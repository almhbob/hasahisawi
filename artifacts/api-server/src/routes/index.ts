import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hasahisawiRouter);

initHasahisawiDb().catch(console.error);

export default router;
