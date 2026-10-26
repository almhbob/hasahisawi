// ════════════════════════════════════════════════════════════════
// 📞 المكالمات الصوتية عبر الإنترنت (WebRTC) — الإشارة عبر الخادم،
// والصوت يمر مباشرة بين الجهازين (أو عبر خادم TURN إن ضُبط).
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { isBlockedBetween } from "./chat-plus";

const router = Router();
const RING_SEC = 45;

let ready: Promise<void> | null = null;
function ensureCalls(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS voice_calls (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER,
        caller_id INTEGER NOT NULL,
        callee_id INTEGER NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'ringing',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        answered_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        ended_by INTEGER
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_voice_calls_callee ON voice_calls(callee_id, status, created_at DESC)`);
      await query(`CREATE TABLE IF NOT EXISTS voice_call_signals (
        id SERIAL PRIMARY KEY,
        call_id INTEGER NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
        from_id INTEGER NOT NULL,
        kind VARCHAR(10) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_voice_call_signals ON voice_call_signals(call_id, id)`);
      // تنظيف إشارات المكالمات القديمة
      await query(`DELETE FROM voice_call_signals WHERE created_at < NOW() - INTERVAL '2 days'`).catch(() => {});
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

router.use("/calls", async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureCalls(); return next(); }
  catch (err) { logger.error({ err }, "[calls] ensure"); return res.status(500).json({ error: "تعذّر تهيئة المكالمات" }); }
});

async function pushTo(userId: number, title: string, body: string, data: Record<string, unknown>, channel = "hasahisawi-urgent-s2", sound = "hasahisawi_urgent") {
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (!rows.length) return;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound, channelId: channel, priority: "high", ttl: RING_SEC, data: { ...data, channelId: channel } }))),
    }).finally(() => clearTimeout(t));
  } catch (e: any) { logger.warn({ err: e?.message }, "[calls] push failed"); }
}

/** خوادم ICE: STUN عامة + TURN إن ضُبطت متغيرات البيئة */
async function iceServers() {
  const list: any[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  const cfId = process.env.CF_TURN_KEY_ID, cfTok = process.env.CF_TURN_API_TOKEN;
  if (cfId && cfTok) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${cfId}/credentials/generate-ice-servers`, {
        method: "POST", headers: { Authorization: `Bearer ${cfTok}`, "Content-Type": "application/json" }, body: JSON.stringify({ ttl: 86400 }),
      });
      const d: any = await r.json();
      if (Array.isArray(d?.iceServers)) list.push(...d.iceServers); else if (d?.iceServers) list.push(d.iceServers);
    } catch (e: any) { logger.warn({ err: e?.message }, "[calls] cf turn"); }
  }
  if (process.env.TURN_URLS) {
    list.push({ urls: process.env.TURN_URLS.split(",").map((s) => s.trim()).filter(Boolean), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return list;
}

const fmtDur = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

async function callFor(req: Request, res: Response) {
  const me = await sessionUser(req);
  if (!me) { res.status(401).json({ error: "سجّل الدخول" }); return null; }
  if (!/^\d+$/.test(String(req.params.id))) { res.status(404).json({ error: "المكالمة غير موجودة" }); return null; }
  const r = await query(
    `SELECT c.*, cu.name AS caller_name, cu.avatar_url AS caller_avatar, ce.name AS callee_name, ce.avatar_url AS callee_avatar
       FROM voice_calls c JOIN users cu ON cu.id=c.caller_id JOIN users ce ON ce.id=c.callee_id WHERE c.id=$1`, [Number(req.params.id)]);
  const call = r.rows[0];
  if (!call || (call.caller_id !== Number(me.id) && call.callee_id !== Number(me.id))) { res.status(404).json({ error: "المكالمة غير موجودة" }); return null; }
  // انتهاء مهلة الرنين
  if (call.status === "ringing" && Date.now() - new Date(call.created_at).getTime() > RING_SEC * 1000) {
    await finish(call, "missed", null);
    call.status = "missed";
  }
  return { me, call };
}

/** إنهاء المكالمة + رسالة توثّقها في المحادثة */
async function finish(call: any, status: string, byId: number | null) {
  const upd = await query(`UPDATE voice_calls SET status=$1, ended_at=NOW(), ended_by=$2 WHERE id=$3 AND status IN ('ringing','accepted') RETURNING answered_at, ended_at`,
    [status, byId, call.id]);
  if (!upd.rows[0] || !call.chat_id) return;
  const ans = upd.rows[0].answered_at;
  const text = status === "ended" && ans
    ? `📞 مكالمة صوتية · ${fmtDur((new Date(upd.rows[0].ended_at).getTime() - new Date(ans).getTime()) / 1000)}`
    : status === "declined" ? "📞 مكالمة صوتية مرفوضة" : "📞 مكالمة صوتية فائتة";
  try {
    await query(`INSERT INTO chat_messages (chat_id, sender_id, content, type) VALUES ($1,$2,$3,'text')`, [call.chat_id, call.caller_id, text]);
    const calleeIsUser1 = (await query(`SELECT user1_id FROM chats WHERE id=$1`, [call.chat_id])).rows[0]?.user1_id === call.callee_id;
    const missed = status !== "ended";
    await query(`UPDATE chats SET last_message=$1, last_message_at=NOW(), last_sender_id=$2,
      unread_user1 = unread_user1 + CASE WHEN $3 AND $4 THEN 1 ELSE 0 END,
      unread_user2 = unread_user2 + CASE WHEN $3 AND NOT $4 THEN 1 ELSE 0 END WHERE id=$5`,
      [text, call.caller_id, missed, calleeIsUser1, call.chat_id]);
    if (status === "missed") pushTo(call.callee_id, "📞 مكالمة فائتة", `من ${call.caller_name || "مستخدم"}`, { type: "chat", chatId: call.chat_id, screen: "chat" }, "hasahisawi-chat-s2", "hasahisawi_chat");
  } catch (e: any) { logger.warn({ err: e?.message }, "[calls] log msg"); }
}

// ── بدء مكالمة ───────────────────────────────────────────────────
router.post("/calls", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const chatId = Number(req.body?.chat_id);
    const chat = (await query(`SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`, [chatId, Number(me.id)])).rows[0];
    if (!chat) return res.status(404).json({ error: "المحادثة غير موجودة" });
    const otherId = chat.user1_id === Number(me.id) ? chat.user2_id : chat.user1_id;
    const blocks = await isBlockedBetween(Number(me.id), otherId);
    if (blocks.length) return res.status(403).json({ error: "لا يمكن الاتصال بهذا المستخدم" });
    // مكالمة جارية لدى الطرف الآخر؟
    const busy = await query(`SELECT id FROM voice_calls WHERE (caller_id=$1 OR callee_id=$1) AND id IS NOT NULL
      AND ((status='accepted' AND created_at > NOW() - INTERVAL '3 hours') OR (status='ringing' AND created_at > NOW() - make_interval(secs => ${RING_SEC})))`, [otherId]);
    if (busy.rows.length) return res.status(409).json({ error: "المستخدم في مكالمة أخرى الآن", busy: true });
    // أغلق أي مكالمة قديمة معلّقة لي
    await query(`UPDATE voice_calls SET status='ended', ended_at=NOW() WHERE (caller_id=$1 OR callee_id=$1) AND status IN ('ringing','accepted')`, [Number(me.id)]);
    const r = await query(`INSERT INTO voice_calls (chat_id, caller_id, callee_id) VALUES ($1,$2,$3) RETURNING *`, [chatId, Number(me.id), otherId]);
    const callee = (await query(`SELECT name, avatar_url FROM users WHERE id=$1`, [otherId])).rows[0] || {};
    await pushTo(otherId, "📞 مكالمة صوتية واردة", `${me.name} يتصل بك…`, { type: "call", callId: r.rows[0].id, callerName: me.name, screen: "call" });
    return res.json({ call: { ...r.rows[0], caller_name: me.name, callee_name: callee.name, callee_avatar: callee.avatar_url }, ice: await iceServers() });
  } catch (err) { logger.error({ err }, "[calls] start"); return res.status(500).json({ error: "تعذّر بدء المكالمة" }); }
});

// ── مكالمة واردة الآن؟ ────────────────────────────────────────────
router.get("/calls/incoming", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.json({ call: null });
    const r = await query(
      `SELECT c.id, c.chat_id, c.caller_id, c.created_at, u.name AS caller_name, u.avatar_url AS caller_avatar
         FROM voice_calls c JOIN users u ON u.id=c.caller_id
        WHERE c.callee_id=$1 AND c.status='ringing' AND c.created_at > NOW() - make_interval(secs => ${RING_SEC})
        ORDER BY c.id DESC LIMIT 1`, [Number(me.id)]);
    return res.json({ call: r.rows[0] || null });
  } catch (err) { logger.error({ err }, "[calls] incoming"); return res.json({ call: null }); }
});

router.get("/calls/ice", async (_req, res) => res.json({ ice: await iceServers() }));

// ── صفحة WebRTC التي تعمل داخل WebView (الإعدادات تُحقن من التطبيق) ──
router.get("/calls/page", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(CALL_PAGE);
});

router.get("/calls/:id", async (req, res) => {
  try {
    const c = await callFor(req, res); if (!c) return;
    return res.json({ call: c.call, ice: await iceServers() });
  } catch (err) { logger.error({ err }, "[calls] get"); return res.status(500).json({ error: "خطأ" }); }
});

router.post("/calls/:id/accept", async (req, res) => {
  try {
    const c = await callFor(req, res); if (!c) return;
    if (c.call.callee_id !== Number(c.me.id)) return res.status(403).json({ error: "غير مسموح" });
    const r = await query(`UPDATE voice_calls SET status='accepted', answered_at=NOW() WHERE id=$1 AND status='ringing' RETURNING *`, [c.call.id]);
    if (!r.rows[0]) return res.status(409).json({ error: "انتهت المكالمة", status: c.call.status });
    return res.json({ call: { ...c.call, ...r.rows[0] }, ice: await iceServers() });
  } catch (err) { logger.error({ err }, "[calls] accept"); return res.status(500).json({ error: "خطأ" }); }
});

router.post("/calls/:id/decline", async (req, res) => {
  try {
    const c = await callFor(req, res); if (!c) return;
    await finish(c.call, c.call.callee_id === Number(c.me.id) ? "declined" : "missed", Number(c.me.id));
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[calls] decline"); return res.status(500).json({ error: "خطأ" }); }
});

router.post("/calls/:id/end", async (req, res) => {
  try {
    const c = await callFor(req, res); if (!c) return;
    await finish(c.call, c.call.status === "ringing" ? "missed" : "ended", Number(c.me.id));
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[calls] end"); return res.status(500).json({ error: "خطأ" }); }
});

// ── الإشارة (offer / answer / ice) ───────────────────────────────
router.post("/calls/:id/signal", async (req, res) => {
  try {
    const c = await callFor(req, res); if (!c) return;
    if (!["ringing", "accepted"].includes(c.call.status)) return res.status(409).json({ error: "انتهت المكالمة", status: c.call.status });
    const kind = String(req.body?.kind);
    if (!["offer", "answer", "ice"].includes(kind)) return res.status(400).json({ error: "نوع غير صالح" });
    const payload = req.body?.payload;
    if (!payload || JSON.stringify(payload).length > 20000) return res.status(400).json({ error: "بيانات غير صالحة" });
    const r = await query(`INSERT INTO voice_call_signals (call_id, from_id, kind, payload) VALUES ($1,$2,$3,$4) RETURNING id`,
      [c.call.id, Number(c.me.id), kind, JSON.stringify(payload)]);
    return res.json({ id: r.rows[0].id });
  } catch (err) { logger.error({ err }, "[calls] signal"); return res.status(500).json({ error: "خطأ" }); }
});

router.get("/calls/:id/signals", async (req, res) => {
  try {
    const c = await callFor(req, res); if (!c) return;
    const after = Number(req.query.after) || 0;
    const r = await query(`SELECT id, kind, payload FROM voice_call_signals WHERE call_id=$1 AND from_id<>$2 AND id>$3 ORDER BY id LIMIT 100`,
      [c.call.id, Number(c.me.id), after]);
    return res.json({ signals: r.rows, status: c.call.status, answered_at: c.call.answered_at });
  } catch (err) { logger.error({ err }, "[calls] signals"); return res.status(500).json({ error: "خطأ" }); }
});

const CALL_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:transparent"><audio id="remote" autoplay playsinline></audio><script>
(function(){
  var C = window.__CALL || {}; var API = (C.api||"").replace(/\\/$/,"") + "/api";
  var H = {"Content-Type":"application/json","Authorization":"Bearer " + C.token};
  function post(m){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} }
  function api(p, o){ o = o||{}; return fetch(API+p,{method:o.method||"GET",headers:H,body:o.body?JSON.stringify(o.body):undefined}).then(function(r){return r.json();}); }
  function signal(kind,payload){ return api("/calls/"+C.callId+"/signal",{method:"POST",body:{kind:kind,payload:payload}}).catch(function(){}); }
  var pc, local, after = 0, pendingIce = [], haveRemote = false, done = false, stats = null;
  function stop(reason){ if(done) return; done = true; try{ local && local.getTracks().forEach(function(t){t.stop();}); }catch(e){} try{ pc && pc.close(); }catch(e){} post({type:"ended",reason:reason}); }
  window.__cmd = function(m){
    if(m.type==="mute" && local){ local.getAudioTracks().forEach(function(t){ t.enabled = !m.on; }); }
    if(m.type==="hangup"){ stop("local"); }
  };
  document.addEventListener("message", function(e){ try{ window.__cmd(JSON.parse(e.data)); }catch(x){} });
  window.addEventListener("message", function(e){ try{ window.__cmd(JSON.parse(e.data)); }catch(x){} });
  function addRemoteIce(c){ if(!haveRemote){ pendingIce.push(c); return; } pc.addIceCandidate(c).catch(function(){}); }
  function poll(){
    if(done) return;
    api("/calls/"+C.callId+"/signals?after="+after).then(function(d){
      if(d.status && d.status!=="ringing" && d.status!=="accepted"){ stop(d.status); return; }
      if(d.status) post({type:"status",status:d.status});
      var chain = Promise.resolve();
      (d.signals||[]).forEach(function(s){
        after = Math.max(after, s.id);
        chain = chain.then(function(){
          if(s.kind==="offer" && C.role==="callee"){
            return pc.setRemoteDescription(s.payload).then(function(){ haveRemote = true; pendingIce.splice(0).forEach(addRemoteIce); return pc.createAnswer(); })
              .then(function(a){ return pc.setLocalDescription(a); }).then(function(){ return signal("answer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp}); });
          }
          if(s.kind==="answer" && C.role==="caller" && !haveRemote){
            return pc.setRemoteDescription(s.payload).then(function(){ haveRemote = true; pendingIce.splice(0).forEach(addRemoteIce); });
          }
          if(s.kind==="ice"){ addRemoteIce(s.payload); }
        }).catch(function(e){ post({type:"log",msg:String(e)}); });
      });
      return chain;
    }).catch(function(){}).then(function(){ setTimeout(poll, haveRemote ? 1500 : 700); });
  }
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}).then(function(stream){
    local = stream;
    pc = new RTCPeerConnection({iceServers: C.ice || [{urls:"stun:stun.l.google.com:19302"}]});
    stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
    pc.ontrack = function(e){ var a = document.getElementById("remote"); a.srcObject = e.streams[0]; var p = a.play(); if(p && p.catch) p.catch(function(){}); };
    pc.onicecandidate = function(e){ if(e.candidate) signal("ice", e.candidate.toJSON ? e.candidate.toJSON() : e.candidate); };
    pc.onconnectionstatechange = function(){ post({type:"conn",state:pc.connectionState}); if(pc.connectionState==="failed"){ stop("failed"); } };
    pc.oniceconnectionstatechange = function(){ post({type:"ice",state:pc.iceConnectionState}); };
    post({type:"ready"});
    if(C.role==="caller"){
      pc.createOffer({offerToReceiveAudio:true}).then(function(o){ return pc.setLocalDescription(o); })
        .then(function(){ return signal("offer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp}); });
    }
    poll();
  }).catch(function(e){ post({type:"mic_error",msg:String(e && e.message || e)}); });
})();
</script></body></html>`;

export default router;
