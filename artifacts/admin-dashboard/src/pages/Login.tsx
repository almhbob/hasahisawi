import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { login, verifyPin, pinRequired, user } = useAuth();
  const [email, setEmail]   = useState("");
  const [pass,  setPass]    = useState("");
  const [pin,   setPin]     = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, hsl(222 47% 6%), hsl(222 47% 10%))",
      padding: 24,
    }}>
      {/* Background glow */}
      <div style={{
        position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 400, borderRadius: "50%",
        background: "hsl(147 60% 42% / 0.06)", filter: "blur(80px)", pointerEvents: "none",
      }} />

      <div style={{
        width: "100%", maxWidth: 400,
        background: "hsl(222 47% 9%)",
        borderRadius: 24,
        border: "1px solid hsl(217 32% 14%)",
        padding: "40px 36px",
        boxShadow: "0 24px 80px -16px rgba(0,0,0,0.5)",
        position: "relative",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: "0 auto 16px",
            background: "hsl(147 60% 42% / 0.15)",
            border: "2px solid hsl(147 60% 42% / 0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36,
          }}>🌿</div>
          <h1 style={{ fontWeight: 800, fontSize: 22, color: "hsl(210 40% 95%)", margin: 0 }}>
            {pinRequired ? "تأكيد هوية المسؤول" : "لوحة تحكم حصاحيصاوي"}
          </h1>
          <p style={{ fontSize: 13, color: "hsl(215 20% 55%)", marginTop: 6 }}>
            {pinRequired
              ? `مرحباً ${user?.name} — أدخل الـ PIN للمتابعة`
              : "تسجيل دخول المسؤول والمشرفين"}
          </p>
        </div>

        {pinRequired ? (
          <form onSubmit={handlePin}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "hsl(215 20% 65%)", display: "block", marginBottom: 8 }}>
                رمز PIN المسؤول
              </label>
              <input
                type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={pin} onChange={e => setPin(e.target.value)}
                placeholder="أدخل رمز PIN" className="input-field"
                style={{ textAlign: "center", letterSpacing: 8, fontSize: 20 }}
                autoFocus
              />
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "hsl(0 72% 55% / 0.15)", border: "1px solid hsl(0 72% 55% / 0.3)", color: "hsl(0 72% 65%)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
              {loading ? "جارٍ التحقق..." : "دخول"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "hsl(215 20% 65%)", display: "block", marginBottom: 8 }}>
                البريد الإلكتروني
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="أدخل البريد الإلكتروني" className="input-field"
                required autoFocus
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "hsl(215 20% 65%)", display: "block", marginBottom: 8 }}>
                كلمة المرور
              </label>
              <input
                type="password" value={pass} onChange={e => setPass(e.target.value)}
                placeholder="أدخل كلمة المرور" className="input-field"
                required
              />
            </div>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "hsl(0 72% 55% / 0.15)", border: "1px solid hsl(0 72% 55% / 0.3)", color: "hsl(0 72% 65%)", fontSize: 13, marginBottom: 16, textAlign: "center" }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
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
