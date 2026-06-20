import { Router } from "express";
import a, { initStabilizationDb } from "./stabilization";
import b, { initFoodPosDb } from "./food-pos";

const r = Router();
r.use(a);
r.use(b);

export async function initExtraDb() {
  try { await initStabilizationDb(); } catch {}
  try { await initFoodPosDb(); } catch {}
}

export default r;
