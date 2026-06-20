import { Router } from "express";
import a, { initStabilizationDb } from "./stabilization";
import b, { initFoodPosDb } from "./food-pos";
import c, { initJoinRequestsDb } from "./join-requests";

const r = Router();
r.use(c);
r.use(a);
r.use(b);

export async function initExtraDb() {
  try { await initJoinRequestsDb(); } catch {}
  try { await initStabilizationDb(); } catch {}
  try { await initFoodPosDb(); } catch {}
}

export default r;
