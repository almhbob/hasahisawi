// صفحة WebRTC التي تعمل داخل WebView مخفي في تطبيق حصاحيصاوي.
// الإعدادات (الرمز ورقم المكالمة وخوادم ICE) تصل من التطبيق عبر window.__CALL
// ثم window.__boot() — لا نعتمد على توقيت الحقن قبل التحميل لأنه غير مضمون على أندرويد.
export const CALL_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:transparent"><audio id="remote" autoplay playsinline></audio><script>
(function(){
  var C = null, API = "", H = null, booted = false;
  var pc, local, after = 0, pendingIce = [], haveRemote = false, done = false, restarted = false, discTimer = null, connected = false;
  function post(m){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch(e){} }
  function api(p, o){ o = o||{}; return fetch(API+p,{method:o.method||"GET",headers:H,body:o.body?JSON.stringify(o.body):undefined}).then(function(r){ if(r.status===401) throw new Error("401"); return r.json(); }); }
  function signal(kind,payload){ return api("/calls/"+C.callId+"/signal",{method:"POST",body:{kind:kind,payload:payload}}).catch(function(e){ log("signal_err", kind+":"+e); }); }
  function log(ev, detail){ try { api("/calls/"+C.callId+"/log",{method:"POST",body:{role:C.role,event:ev,detail:String(detail||"").slice(0,300)}}).catch(function(){}); } catch(e){} }
  function stop(reason){ if(done) return; done = true; try{ local && local.getTracks().forEach(function(t){t.stop();}); }catch(e){} try{ pc && pc.close(); }catch(e){} post({type:"ended",reason:reason}); }
  // تحسين الصوت: تصحيح الأخطاء (FEC) ومعدل بت أعلى لـ Opus
  function tuneSdp(sdp){
    try {
      var m = sdp.match(/a=rtpmap:(\\d+) opus\\/48000/i); if(!m) return sdp;
      var pt = m[1], re = new RegExp("a=fmtp:"+pt+" ([^\\\\r\\\\n]*)");
      if (re.test(sdp)) return sdp.replace(re, function(_, p){ var x = p.replace(/;?(useinbandfec|maxaveragebitrate|usedtx|stereo)=[^;]*/g,""); return "a=fmtp:"+pt+" "+x+";useinbandfec=1;maxaveragebitrate=40000;usedtx=0"; });
      return sdp;
    } catch(e){ return sdp; }
  }
  function desc(d){ return {type:d.type, sdp:tuneSdp(d.sdp)}; }
  window.__cmd = function(m){
    if(m.type==="mute" && local){ local.getAudioTracks().forEach(function(t){ t.enabled = !m.on; }); }
    if(m.type==="hangup"){ stop("local"); }
  };
  document.addEventListener("message", function(e){ try{ window.__cmd(JSON.parse(e.data)); }catch(x){} });
  window.addEventListener("message", function(e){ try{ window.__cmd(JSON.parse(e.data)); }catch(x){} });
  function addRemoteIce(c){ if(!haveRemote){ pendingIce.push(c); return; } pc.addIceCandidate(c).catch(function(e){ log("ice_add_err", e); }); }
  function makeOffer(restart){
    return pc.createOffer({offerToReceiveAudio:true, iceRestart:!!restart}).then(function(o){ return pc.setLocalDescription(desc(o)); })
      .then(function(){ return signal("offer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp}); });
  }
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
              .then(function(a){ return pc.setLocalDescription(desc(a)); }).then(function(){ return signal("answer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp}); });
          }
          if(s.kind==="answer" && C.role==="caller" && pc.signalingState==="have-local-offer"){
            return pc.setRemoteDescription(s.payload).then(function(){ haveRemote = true; pendingIce.splice(0).forEach(addRemoteIce); });
          }
          if(s.kind==="ice"){ addRemoteIce(s.payload); }
        }).catch(function(e){ log("sdp_err", e); post({type:"log",msg:String(e)}); });
      });
      return chain;
    }).catch(function(e){ if(String(e).indexOf("401")>=0){ log("auth","401"); } }).then(function(){ setTimeout(poll, connected ? 2000 : 600); });
  }
  function candType(c){ var m = /typ (\\w+)/.exec(c||""); return m ? m[1] : "?"; }
  function onConnected(){
    if(connected) return; connected = true; post({type:"conn",state:"connected"});
    if(pc.getStats) pc.getStats().then(function(r){ var info=""; r.forEach(function(x){ if(x.type==="candidate-pair" && (x.nominated||x.selected) && x.state==="succeeded"){ var l=r.get(x.localCandidateId), rm=r.get(x.remoteCandidateId); info=(l&&l.candidateType)+"/"+(rm&&rm.candidateType); } }); log("connected", info); }).catch(function(){});
  }
  function boot(){
    if(booted) return; C = window.__CALL; if(!C || !C.token || !C.callId) return;
    booted = true;
    API = String(C.api||"").replace(/\\/$/,"") + "/api";
    H = {"Content-Type":"application/json","Authorization":"Bearer " + C.token};
    log("boot", (navigator.userAgent||"").slice(0,120));
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ log("no_media",""); post({type:"mic_error",msg:"no mediaDevices"}); return; }
    navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false}).then(function(stream){
      local = stream;
      pc = new RTCPeerConnection({iceServers: C.ice && C.ice.length ? C.ice : [{urls:"stun:stun.l.google.com:19302"}], iceCandidatePoolSize: 2});
      stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
      pc.ontrack = function(e){ var a = document.getElementById("remote"); a.srcObject = e.streams[0]; a.volume = 1; var p = a.play(); if(p && p.catch) p.catch(function(err){ log("play_err", err); }); };
      var types = {};
      pc.onicecandidate = function(e){ if(e.candidate){ var t = candType(e.candidate.candidate); types[t]=(types[t]||0)+1; signal("ice", e.candidate.toJSON ? e.candidate.toJSON() : e.candidate); } else { log("gathered", JSON.stringify(types)); } };
      pc.onconnectionstatechange = function(){
        var s = pc.connectionState; post({type:"conn",state:s});
        if(s==="connected") onConnected();
        if(s==="failed"){ log("failed", JSON.stringify(types)); if(C.role==="caller" && !restarted){ restarted = true; makeOffer(true).catch(function(){}); } else { stop("failed"); } }
      };
      pc.oniceconnectionstatechange = function(){
        var s = pc.iceConnectionState; post({type:"ice",state:s});
        if(s==="connected"||s==="completed") onConnected();
        if(s==="disconnected"){ clearTimeout(discTimer); discTimer = setTimeout(function(){ if(pc.iceConnectionState==="disconnected" && C.role==="caller" && !restarted){ restarted = true; log("ice_restart",""); makeOffer(true).catch(function(){}); } }, 5000); }
      };
      post({type:"ready"});
      if(C.role==="caller"){ makeOffer(false).catch(function(e){ log("offer_err", e); }); }
      poll();
    }).catch(function(e){ log("mic_err", e && e.name + ":" + e.message); post({type:"mic_error",msg:String(e && e.message || e)}); });
  }
  window.__boot = boot;
  boot();
  var tries = 0; var t = setInterval(function(){ if(booted || ++tries > 200){ clearInterval(t); return; } boot(); }, 100);
})();
</script></body></html>`;
