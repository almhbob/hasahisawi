import { useState } from "react";
import { useAuth } from "@/lib/auth";

type Mode = "login" | "reset" | "create";

export default function Login() {
  const { login, verifyPin, pinRequired, user } = useAuth();
  const [mode, setMode]       = useState<Mode>("login");
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [pin, setPin]         = useState("");
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset password fields
  const [resetEmail, setResetEmail]   = useState("");
  const [resetPass, setResetPass]     = useState("");
  const [resetPin, setResetPin]       = useState("");

  // Create admin fields
  const [createName, setCreateName]   = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPass, setCreatePass]   = useState("");
  const [createRole, setCreateRole]   = useState<"admin" | "moderator">("moderator");
  const [createCode, setCreateCode]   = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
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
    setError(""); setSuccess("");
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
    setError(""); setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-admin-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail, new_password: resetPass, admin_code: resetPin }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; message?: string };
      if (!res.ok) { setError(d.error || "حدث خطأ"); return; }
      setSuccess("✅ " + (d.message || "تم تعيين كلمة المرور بنجاح"));
      setResetEmail(""); setResetPass(""); setResetPin("");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, email: createEmail, password: createPass, role: createRole, admin_code: createCode }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; user?: { name: string; role: string } };
      if (!res.ok) { setError(d.error || "حدث خطأ"); return; }
      setSuccess(`✅ تم إنشاء حساب "${d.user?.name}" بدور "${d.user?.role === "admin" ? "مسؤول" : "مشرف"}" بنجاح`);
      setCreateName(""); setCreateEmail(""); setCreatePass(""); setCreateCode("");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid hsl(217 32% 18%)",
    background: "hsl(222 47% 7%)", color: "hsl(210 40% 95%)", fontSize: 14, outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: "hsl(215 20% 65%)", display: "block", marginBottom: 7,
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: "pointer",
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
        background: "hsl(147 60% 42% / 0.06)", filter: "blur(80px)", pointerEvents: "none",
      }} />

      <div style={{
        width: "100%", maxWidth: 420,
        background: "hsl(222 47% 9%)",
        borderRadius: 24, border: "1px solid hsl(217 32% 14%)",
        padding: "40px 36px", boxShadow: "0 24px 80px -16px rgba(0,0,0,0.5)",
        position: "relative",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 20, margin: "0 auto 14px",
            background: "hsl(147 60% 42% / 0.15)", border: "2px solid hsl(147 60% 42% / 0.35)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34,
          }}>🌿</div>
          <h1 style={{ fontWeight: 800, fontSize: 20, color: "hsl(210 40% 95%)", margin: 0 }}>
            {pinRequired ? "تأكيد هوية المسؤول" :
             mode === "reset" ? "إعادة تعيين كلمة المرور" :
             mode === "create" ? "إنشاء حساب إدارة" :
             "لوحة تحكم حصاحيصاوي"}
          </h1>
          <p style={{ fontSize: 13, color: "hsl(215 20% 55%)", marginTop: 5 }}>
            {pinRequired ? `مرحباً ${user?.name} — أدخل الـ PIN للمتابعة` :
             mode === "reset" ? "أدخل بريدك الإلكتروني ورمز PIN لإعادة التعيين" :
             mode === "create" ? "إنشاء حساب مسؤول أو مشرف جديد" :
             "تسجيل دخول المسؤول والمشرفين"}
          </p>
        </div>

        {/* Error / Success */}
        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "hsl(0 72% 55% / 0.15)", border: "1px solid hsl(0 72% 55% / 0.3)", color: "hsl(0 72% 65%)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "hsl(147 60% 42% / 0.15)", border: "1px solid hsl(147 60% 42% / 0.3)", color: "hsl(147 60% 55%)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
            {success}
          </div>
        )}

        {/* PIN verification */}
        {pinRequired ? (
          <form onSubmit={handlePin}>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>رمز PIN المسؤول</label>
              <input
                type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={pin} onChange={e => setPin(e.target.value)}
                placeholder="أدخل رمز PIN" style={{ ...inputStyle, textAlign: "center", letterSpacing: 8, fontSize: 20 }}
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "جارٍ التحقق..." : "دخول"}
            </button>
          </form>

        /* Login form */
        ) : mode === "login" ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>البريد الإلكتروني</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="أدخل البريد الإلكتروني" style={inputStyle} required autoFocus />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>كلمة المرور</label>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)}
                placeholder="أدخل كلمة المرور" style={inputStyle} required />
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "جارٍ التحقق..." : "دخول للوحة التحكم"}
            </button>
            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center" }}>
              <button type="button" onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}
                style={{ background: "none", border: "none", color: "hsl(215 20% 50%)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                نسيت كلمة المرور؟
              </button>
              <span style={{ color: "hsl(215 20% 30%)", fontSize: 12 }}>|</span>
              <button type="button" onClick={() => { setMode("create"); setError(""); setSuccess(""); }}
                style={{ background: "none", border: "none", color: "hsl(147 60% 50%)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                إنشاء حساب إدارة
              </button>
            </div>
          </form>

        /* Reset password */
        ) : mode === "reset" ? (
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>البريد الإلكتروني</label>
              <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                placeholder="بريد حساب الإدارة" style={inputStyle} required autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>كلمة المرور الجديدة</label>
              <input type="password" value={resetPass} onChange={e => setResetPass(e.target.value)}
                placeholder="6 أحرف على الأقل" style={inputStyle} required minLength={6} />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>رمز PIN المسؤول</label>
              <input type="password" inputMode="numeric" value={resetPin} onChange={e => setResetPin(e.target.value)}
                placeholder="أدخل رمز PIN للتحقق" style={inputStyle} required />
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "جارٍ التعيين..." : "تعيين كلمة المرور"}
            </button>
            <button type="button" onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "hsl(215 20% 50%)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
              ← رجوع لتسجيل الدخول
            </button>
          </form>

        /* Create admin account */
        ) : (
          <form onSubmit={handleCreate}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>الاسم الكامل</label>
              <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
                placeholder="اسم المسؤول أو المشرف" style={inputStyle} required autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>البريد الإلكتروني</label>
              <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                placeholder="البريد الإلكتروني" style={inputStyle} required />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>كلمة المرور</label>
              <input type="password" value={createPass} onChange={e => setCreatePass(e.target.value)}
                placeholder="6 أحرف على الأقل" style={inputStyle} required minLength={6} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>الدور</label>
              <select value={createRole} onChange={e => setCreateRole(e.target.value as "admin" | "moderator")} style={selectStyle}>
                <option value="moderator">مشرف (Moderator)</option>
                <option value="admin">مسؤول (Admin)</option>
              </select>
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>رمز PIN المسؤول</label>
              <input type="password" inputMode="numeric" value={createCode} onChange={e => setCreateCode(e.target.value)}
                placeholder="رمز التحقق" style={inputStyle} required />
            </div>
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
            </button>
            <button type="button" onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "hsl(215 20% 50%)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
              ← رجوع لتسجيل الدخول
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
