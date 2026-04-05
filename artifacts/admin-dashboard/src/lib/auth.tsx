import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiFetch } from "./api";

type AdminUser = {
  id: number; name: string; email: string; role: string;
};
type AuthCtx = {
  user: AdminUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  pinRequired: boolean;
};

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]             = useState<AdminUser | null>(null);
  const [token, setToken]           = useState<string | null>(() => localStorage.getItem("admin_token"));
  const [loading, setLoading]       = useState(true);
  const [pinRequired, setPinRequired] = useState(false);

  useEffect(() => {
    if (token) {
      apiFetch("/auth/me")
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.user && (d.user.role === "admin" || d.user.role === "moderator")) {
            setUser(d.user);
          } else {
            setToken(null);
            localStorage.removeItem("admin_token");
          }
        })
        .catch(() => { setToken(null); localStorage.removeItem("admin_token"); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone_or_email: email, password }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || "بيانات خاطئة");
    }
    const d = await res.json();
    if (!d.user || (d.user.role !== "admin" && d.user.role !== "moderator")) {
      throw new Error("ليس لديك صلاحية الدخول للوحة التحكم");
    }
    localStorage.setItem("admin_token", d.token);
    setToken(d.token);
    setUser(d.user);
    if (d.user.role === "admin") {
      setPinRequired(true);
    }
  };

  const verifyPin = async (pin: string) => {
    const res = await apiFetch("/admin/validate-pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.valid) throw new Error("رمز PIN غير صحيح");
    setPinRequired(false);
    localStorage.setItem("admin_pin_verified", "1");
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_pin_verified");
    setToken(null);
    setUser(null);
    setPinRequired(false);
  };

  return (
    <Ctx.Provider value={{ user, token, login, verifyPin, logout, loading, pinRequired }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
