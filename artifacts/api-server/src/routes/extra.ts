import { Router } from "express";
import a, { initStabilizationDb } from "./stabilization";
import b, { initFoodPosDb } from "./food-pos";

const r = Router();
r.use(a);
r.use(b);

export async function initExtraDb() {
  await initStabilizationDb();
  await initFoodPosDb();
}

export default r;
