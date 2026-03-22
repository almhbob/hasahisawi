import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import {
  isBiometricsAvailable,
  isBiometricsEnabled,
  setBiometricsEnabled,
  saveBiometricIdentifier,
  authenticate,
} from "@/lib/biometrics";

export type AuthUser = {
  id: number;
  name: string;
  national_id_masked?: string | null;
  phone?: string | null;
  email?: string | null;
  role: "user" | "admin" | "moderator" | "guest";
  permissions?: string[];
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isGuest: boolean;
  canPost: boolean;
  biometricsAvailable: boolean;
  biometricsEnabled: boolean;
  login: (phoneOrEmail: string, password: string) => Promise<void>;
  loginWithBiometrics: () => Promise<boolean>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    nationalId: string,
    phoneOrEmail: string,
    isEmail: boolean,
    password: string,
    birthDate?: string,
    neighborhood?: string,
  ) => Promise<void>;
  registerAdmin: (name: string, email: string, password: string, adminCode: string) => Promise<void>;
  enterAsGuest: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  enableBiometrics: (identifier: string) => Promise<void>;
  disableBiometrics: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "auth_session_token";
const USER_KEY  = "auth_user_data";
const GUEST_KEY = "auth_is_guest";

function apiUrl(path: string): string {
  return new URL(path, getApiUrl()).toString();
}

async function apiFetch(path: string, body: object): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "حدث خطأ في الاتصال بالخادم");
  return json;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);

  const canPost = !isGuest && user !== null;

  // ── فحص توفر البصمة ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const available = await isBiometricsAvailable();
      setBiometricsAvailable(available);
      if (available) {
        const enabled = await isBiometricsEnabled();
        setBiometricsEnabledState(enabled);
      }
    })();
  }, []);

  // ── استعادة الجلسة عند بدء التطبيق ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUser, savedGuest] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
          AsyncStorage.getItem(GUEST_KEY),
        ]);

        if (savedGuest === "1" && !savedToken) {
          setIsGuest(true);
          setUser({ id: 0, name: "زائر", role: "guest" });
          setIsLoading(false);
          return;
        }

        if (savedToken && savedUser) {
          // إذا كانت البصمة مفعّلة، لا نستعيد الجلسة تلقائياً (تنتظر loginWithBiometrics)
          const bioEnabled = await isBiometricsEnabled();
          const bioAvailable = await isBiometricsAvailable();

          if (bioEnabled && bioAvailable) {
            // نحفظ البيانات في الذاكرة دون الإعلان عن المستخدم — شاشة الدخول ستعرض زر البصمة
            // استمر في التحقق من صلاحية الجلسة خلفياً
            try {
              const res = await fetch(apiUrl("/api/auth/me"), {
                headers: { Authorization: `Bearer ${savedToken}` },
              });
              if (!res.ok) {
                await clearSession();
                await setBiometricsEnabled(false);
                setBiometricsEnabledState(false);
              }
            } catch {}
            setIsLoading(false);
            return;
          }

          // لا بصمة — استعد الجلسة مباشرة
          try {
            const res = await fetch(apiUrl("/api/auth/me"), {
              headers: { Authorization: `Bearer ${savedToken}` },
            });
            if (res.ok) {
              const json = await res.json();
              setToken(savedToken);
              setUser(json.user);
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(json.user));
            } else {
              await clearSession();
            }
          } catch {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
          }
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const saveSession = async (u: AuthUser, t: string) => {
    setUser(u);
    setToken(t);
    setIsGuest(false);
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, t),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(u)),
      AsyncStorage.removeItem(GUEST_KEY),
    ]);
  };

  const clearSession = async () => {
    setUser(null);
    setToken(null);
    setIsGuest(false);
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(GUEST_KEY),
    ]);
  };

  const enterAsGuest = () => {
    setIsGuest(true);
    setUser({ id: 0, name: "زائر", role: "guest" });
    setToken(null);
    AsyncStorage.setItem(GUEST_KEY, "1");
  };

  // ── تسجيل الدخول بالبصمة ──────────────────────────────────────
  const loginWithBiometrics = async (): Promise<boolean> => {
    try {
      const success = await authenticate("تحقق من هويتك للدخول إلى حصاحيصاوي");
      if (!success) return false;

      const [savedToken, savedUser] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      if (!savedToken || !savedUser) return false;

      // تحقق من الجلسة مع الخادم
      try {
        const res = await fetch(apiUrl("/api/auth/me"), {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (res.ok) {
          const json = await res.json();
          setToken(savedToken);
          setUser(json.user);
          setIsGuest(false);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(json.user));
          return true;
        } else {
          // الجلسة منتهية — ألغِ البصمة وامسح الجلسة
          await clearSession();
          await setBiometricsEnabled(false);
          setBiometricsEnabledState(false);
          return false;
        }
      } catch {
        // لا اتصال — استخدم البيانات المحفوظة
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setIsGuest(false);
        return true;
      }
    } catch {
      return false;
    }
  };

  // ── تسجيل الدخول ──────────────────────────────────────────
  const login = async (phoneOrEmail: string, password: string) => {
    const json = await apiFetch("/api/auth/login", {
      phone_or_email: phoneOrEmail.trim(),
      password,
    });
    await saveSession(json.user, json.token);
  };

  const loginAdmin = async (email: string, password: string) => {
    const json = await apiFetch("/api/auth/admin-login", { email, password });
    await saveSession(json.user, json.token);
  };

  // ── إنشاء حساب جديد ───────────────────────────────────────
  const register = async (
    name: string,
    nationalId: string,
    phoneOrEmail: string,
    isEmail: boolean,
    password: string,
    birthDate?: string,
    neighborhood?: string,
  ) => {
    const body: Record<string, string> = { name, password };
    if (nationalId)   body.national_id  = nationalId;
    if (isEmail || phoneOrEmail.includes("@")) body.email = phoneOrEmail.trim();
    else              body.phone        = phoneOrEmail.trim();
    if (birthDate)    body.birth_date   = birthDate;
    if (neighborhood) body.neighborhood = neighborhood;

    const json = await apiFetch("/api/auth/register", body);
    await saveSession(json.user, json.token);
  };

  const registerAdmin = async (name: string, email: string, password: string, adminCode: string) => {
    const json = await apiFetch("/api/auth/register-admin", {
      name, email, password, admin_code: adminCode,
    });
    await saveSession(json.user, json.token);
  };

  // ── تفعيل/تعطيل البصمة ────────────────────────────────────
  const enableBiometrics = async (identifier: string) => {
    await setBiometricsEnabled(true);
    await saveBiometricIdentifier(identifier);
    setBiometricsEnabledState(true);
  };

  const disableBiometrics = async () => {
    await setBiometricsEnabled(false);
    setBiometricsEnabledState(false);
  };

  // ── تحديث بيانات المستخدم ─────────────────────────────────
  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setUser(json.user);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(json.user));
      }
    } catch {}
  };

  // ── تسجيل الخروج ──────────────────────────────────────────
  const logout = async () => {
    if (token) {
      try {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    await clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user, token, isLoading, isGuest, canPost,
        biometricsAvailable, biometricsEnabled,
        login, loginWithBiometrics, loginAdmin, register, registerAdmin,
        enterAsGuest, logout, refreshUser,
        enableBiometrics, disableBiometrics,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
