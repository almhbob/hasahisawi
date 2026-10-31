import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminUsersFirebaseRouter from "./admin-users-firebase";
import travelAgenciesRouter, { initTravelAgenciesDb } from "./travel-agencies";
import extraRouter, { initExtraDb } from "./extra";
import lawyersAdminRouter, { ensureLawyersDb } from "./lawyers-admin";
import transportLiveRouter, { initTransportLiveDb } from "./transport-live";
import hasahisawiRouter, { initHasahisawiDb } from "./hasahisawi";
import uploadRouter from "./upload";
import adminAlertsRouter, { captureAdminAlerts, ensureAdminAlertsDb } from "./admin-alerts";
import accessGuardsRouter, { womenCornerGuard, genderLockGuard } from "./access-guards";
import storesRouter, { ensureStoresDb } from "./stores";
import curriculumUploadRouter from "./curriculum-upload";
import deviceAuthRouter from "./device-auth";
import ciPlayTokenRouter from "./ci-play-token";
import sportsClubsRouter from "./sports-clubs";
import providerListingsRouter from "./provider-listings";
import chatPlusRouter from "./chat-plus";
import profilePlusRouter from "./profile-plus";
import socialSafetyRouter, { ensureSocialSafety } from "./social-safety";
import socialPlusRouter, { ensureSocialPlus } from "./social-plus";
import volunteerRouter, { ensureVolunteerDb } from "./volunteer";
import contestsRouter, { ensureContestsDb } from "./contests";
import callsRouter from "./calls";
import zawajilAdminRouter from "./zawajil-admin";

const router: IRouter = Router();

router.use(healthRouter);
// حواجز الوصول وتسجيل تنبيهات الإدارة قبل أي مسار.
router.use(womenCornerGuard);
router.use(genderLockGuard);
router.use(captureAdminAlerts);
router.use(adminAlertsRouter);
router.use(accessGuardsRouter);
router.use(uploadRouter);
router.use(storesRouter);
router.use(curriculumUploadRouter);
router.use(deviceAuthRouter);
router.use(ciPlayTokenRouter);
router.use(sportsClubsRouter);
router.use(providerListingsRouter);
router.use(chatPlusRouter);
router.use(profilePlusRouter);
router.use(socialSafetyRouter);
router.use(socialPlusRouter);
router.use(volunteerRouter);
router.use(contestsRouter);
router.use(callsRouter);
router.use(zawajilAdminRouter);
router.use(adminUsersFirebaseRouter);
router.use(travelAgenciesRouter);
router.use(extraRouter);
// المحامون أولاً حتى تعمل الإدارة والاشتراكات حتى لو كانت المسارات القديمة ناقصة.
router.use(lawyersAdminRouter);
// النقل الحي قبل الراوتر العام حتى تكون طلبات السائقين وقبول الرحلات ذرّية وواضحة.
router.use(transportLiveRouter);
router.use(hasahisawiRouter);

async function initializeDatabaseSchemas() {
  // Core schema creates users and the tables referenced by feature schemas.
  await initHasahisawiDb();
  await initTravelAgenciesDb();
  await initExtraDb();
  await ensureLawyersDb();
  await initTransportLiveDb();
  await ensureStoresDb();
  // بعد جداول المجتمع (social_posts/social_comments) لأنها تضيف عموداً لها.
  await ensureSocialSafety();
  await ensureSocialPlus();
  await ensureVolunteerDb();
  await ensureContestsDb();
  // Keep this last: its table is the completion marker used by readiness checks.
  await ensureAdminAlertsDb();
}

void initializeDatabaseSchemas().catch((error) => {
  console.error("[db] schema initialization failed", error);
});

export default router;
