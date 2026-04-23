import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

type Mode = "login" | "reset";

export default function Login() {
  const { login, verifyPin, pinRequired, user } = useAuth();
  const [email, setEmail]   = useState("");
  const [pass,  setPass]    = useState("");
  const [pin,   setPin]     = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const [mode, setMode]             = useState<Mode>("login");
  const [resetEmail,  setResetEmail]   = useState("");
  const [resetPass,   setResetPass]    = useState("");
  const [resetPass2,  setResetPass2]   = useState("");
  const [resetMsg,    setResetMsg]     = useState("");
  const [resetError,  setResetError]   = useState("");
  const [resetLoading,setResetLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, pass);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyPin(pin);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetMsg("");
    if (!resetEmail.trim()) { setResetError("أدخل البريد الإلكتروني"); return; }
    if (resetPass.length < 6) { setResetError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (resetPass !== resetPass2) { setResetError("كلمتا المرور غير متطابقتين"); return; }
    setResetLoading(true);
    try {
      const res = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identifier: resetEmail.trim(), new_password: resetPass }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "حدث خطأ");
      setResetMsg("تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.");
      setResetEmail(""); setResetPass(""); setResetPass2("");
      setTimeout(() => { setMode("login"); setResetMsg(""); }, 2500);
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const green = "hsl(147 60% 42%)";
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: "hsl(215 20% 65%)", display: "block", marginBottom: 8,
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, hsl(222 47% 6%), hsl(222 47% 10%))",
      padding: 24,
    }}>
      <div style={{
        position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 400, borderRadius: "50%",
        background: `${green}0f`, filter: "blur(80px)", pointerEvents: "none",
      }} />

      <div style={{
        width: "100%", maxWidth: 420,
        background: "hsl(222 47% 9%)", borderRadius: 24,
        border: "1px solid hsl(217 32% 14%)", padding: "40px 36px",
        boxShadow: "0 24px 80px -16px rgba(0,0,0,0.5)", position: "relative",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: "0 auto 16px",
            background: `${green}26`, border: `2px solid ${green}59`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36,
          }}>🌿</div>
          <h1 style={{ fontWeight: 800, fontSize: 22, color: "hsl(210 40% 95%)", margin: 0 }}>
            {pinRequired ? "تأكيد هوية المسؤول" : mode === "reset" ? "استعادة كلمة المرور" : "لوحة تحكم حصاحيصاوي"}
          </h1>
          <p style={{ fontSize: 13, color: "hsl(215 20% 55%)", marginTop: 6 }}>
            {pinRequired
              ? `مرحباً ${user?.name} — أدخل الـ PIN للمتابعة`
              : mode === "reset"
              ? "أدخل بريدك وكلمة المرور الجديدة"
              : "تسجيل دخول المسؤول والمشرفين"}
          </p>
        </div>

        {/* ─── PIN form ─── */}
        {pinRequired ? (
          <form onSubmit={handlePin}>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>رمز PIN المسؤول</label>
              <input
                type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={pin} onChange={e => setPin(e.target.value)}
                placeholder="أدخل رمز PIN" className="input-field"
                style={{ textAlign: "center", letterSpacing: 8, fontSize: 20 }}
                autoFocus
              />
            </div>
            {error && <ErrorBox msg={error} />}
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "جارٍ التحقق..." : "دخول"}
            </button>
          </form>

        ) : mode === "reset" ? (
          /* ─── RESET PASSWORD form ─── */
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>البريد الإلكتروني</label>
              <input
                type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                placeholder="أدخل بريدك الإلكتروني" className="input-field"
                required autoFocus
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>كلمة المرور الجديدة</label>
              <input
                type="password" value={resetPass} onChange={e => setResetPass(e.target.value)}
                placeholder="6 أحرف على الأقل" className="input-field"
                required
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>تأكيد كلمة المرور</label>
              <input
                type="password" value={resetPass2} onChange={e => setResetPass2(e.target.value)}
                placeholder="أعد إدخال كلمة المرور" className="input-field"
                required
              />
            </div>
            {resetError && <ErrorBox msg={resetError} />}
            {resetMsg && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: `${green}26`, border: `1px solid ${green}4d`, color: green, fontSize: 13, marginBottom: 16, textAlign: "center" }}>
                ✓ {resetMsg}
              </div>
            )}
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={resetLoading}>
              {resetLoading ? "جارٍ التحديث..." : "تغيير كلمة المرور"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("login"); setResetError(""); setResetMsg(""); }}
              style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "hsl(215 20% 50%)", fontSize: 13, cursor: "pointer", padding: "8px 0" }}
            >
              ← العودة لتسجيل الدخول
            </button>
          </form>

        ) : (
          /* ─── LOGIN form ─── */
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>البريد الإلكتروني</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="أدخل البريد الإلكتروني" className="input-field"
                required autoFocus
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={labelStyle}>كلمة المرور</label>
                <button
                  type="button"
                  onClick={() => { setMode("reset"); setError(""); setResetEmail(email); }}
                  style={{ background: "none", border: "none", color: green, fontSize: 12, cursor: "pointer", padding: 0, fontWeight: 600 }}
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
              <input
                type="password" value={pass} onChange={e => setPass(e.target.value)}
                placeholder="أدخل كلمة المرور" className="input-field"
                required
              />
            </div>

            {error && <ErrorBox msg={error} />}
            <button
              type="submit"
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={loading}
            >
              {loading ? "جارٍ التحقق..." : "دخول للوحة التحكم"}
            </button>
          </form>
        )}

        <p style={{ textAlign: "center", fontSize: 12, color: "hsl(215 20% 40%)", marginTop: 24, marginBottom: 0 }}>
          مخصص للمسؤولين والمشرفين فقط
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 10,
      background: "hsl(0 72% 55% / 0.15)", border: "1px solid hsl(0 72% 55% / 0.3)",
      color: "hsl(0 72% 65%)", fontSize: 13, marginBottom: 16, textAlign: "center",
    }}>
      {msg}
    </div>
  );
}
