import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

export type AuthUser = {
  id: number;
  uid?: string;
  name: string;
  national_id_masked?: string | null;
  phone?: string | null;
  email?: string | null;
  role: "user" | "admin" | "moderator" | "guest";
  permissions?: string[];
  neighborhood?: string | null;
  avatar_url?: string | null;
  gender?: "male" | "female" | null;
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
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithGoogleWeb: () => Promise<void>;
  loginWithBiometrics: () => Promise<boolean>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  loginModerator: (phoneOrEmail: string, password: string) => Promise<void>;
  register: (
    name: string,
    nationalId: string,
    phoneOrEmail: string,
    isEmail: boolean,
    password: string,
    birthDate?: string,
    neighborhood?: string,
    gender?: string,
    otpCode?: string,
  ) => Promise<void>;
  setUserGender: (gender: "male" | "female") => Promise<void>;
  completeProfile: (gender: "male" | "female", neighborhood?: string) => Promise<void>;
  registerAdmin: (name: string, email: string, password: string, adminCode: string) => Promise<void>;
  enterAsGuest: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshBackendToken: () => Promise<string | null>;
  enableBiometrics: (identifier: string) => Promise<void>;
  disableBiometrics: () => Promise<void>;
  updateProfile: (updates: { name?: string; avatar_url?: string | null }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "auth_session_token";
const USER_KEY = "auth_user_data";
const GUEST_KEY = "auth_is_guest";

async function safeJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!res.ok) throw new Error(data?.error || data?.message || "تعذّر تنفيذ الطلب");
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

function emailFromPhoneOrEmail(value: string) {
  const v = value.trim();
  if (v.includes("@")) return v.toLowerCase();
  return `${v.replace(/\s+/g, "").replace(/^\+/, "")}@hasahisawi.app`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const canPost = !isGuest && !!user;

  useEffect(() => {
    (async () => {
      try {
        const [g, t, u] = await Promise.all([
          AsyncStorage.getItem(GUEST_KEY),
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (g === "1") {
          setIsGuest(true);
          setUser({ id: 0, name: "زائر", role: "guest" });
        } else if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  async function saveSession(authUser: AuthUser, authToken: string | null) {
    setUser(authUser);
    setToken(authToken);
    setIsGuest(authUser.role === "guest");
    if (authUser.role === "guest") {
      await AsyncStorage.setItem(GUEST_KEY, "1");
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(authUser));
    } else {
      await AsyncStorage.removeItem(GUEST_KEY);
      if (authToken) await AsyncStorage.setItem(TOKEN_KEY, authToken);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(authUser));
    }
  }

  const login = async (phoneOrEmail: string, password: string) => {
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const data = await safeJson<{ user: AuthUser; token: string }>(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_or_email: phoneOrEmail.trim(), password }),
    });
    await saveSession(data.user, data.token);
  };

  const loginAdmin = async (email: string, password: string) => {
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const data = await safeJson<{ user: AuthUser; token: string }>(`${base}/api/auth/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    await saveSession({ ...data.user, role: data.user.role || "admin" }, data.token);
  };

  const loginModerator = async (phoneOrEmail: string, password: string) => {
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const data = await safeJson<{ user: AuthUser; token: string }>(`${base}/api/auth/moderator-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_or_email: phoneOrEmail.trim(), password }),
    });
    await saveSession({ ...data.user, role: "moderator" }, data.token);
  };

  const register = async (
    name: string,
    nationalId: string,
    phoneOrEmail: string,
    _isEmail: boolean,
    password: string,
    birthDate?: string,
    neighborhood?: string,
    gender?: string,
    otpCode?: string,
  ) => {
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const isEmail = phoneOrEmail.includes("@");
    const data = await safeJson<{ user: AuthUser; token: string }>(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: isEmail ? undefined : phoneOrEmail.trim(),
        email: isEmail ? phoneOrEmail.trim().toLowerCase() : undefined,
        password,
        national_id: nationalId || undefined,
        birth_date: birthDate || undefined,
        neighborhood: neighborhood || undefined,
        gender: gender || undefined,
        otp_code: otpCode || undefined,
      }),
    });
    await saveSession(data.user, data.token);
  };

  const registerAdmin = async (name: string, email: string, password: string, adminCode: string) => {
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const data = await safeJson<{ user: AuthUser; token: string }>(`${base}/api/auth/register-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: email.trim().toLowerCase(), password, admin_code: adminCode }),
    });
    await saveSession({ ...data.user, role: "admin" }, data.token);
  };

  const enterAsGuest = () => {
    saveSession({ id: 0, name: "زائر", role: "guest" }, null).catch(() => {});
  };

  const logout = async () => {
    try {
      const base = getApiUrl();
      if (base && token) await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch {}
    setUser(null); setToken(null); setIsGuest(false);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, GUEST_KEY]);
  };

  const refreshUser = async () => {
    if (!token) return;
    const base = getApiUrl();
    if (!base) return;
    try {
      const data = await safeJson<{ user: AuthUser }>(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      setUser(data.user);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {}
  };

  const setUserGender = async (gender: "male" | "female") => {
    const updated = user ? { ...user, gender } : user;
    if (updated) {
      setUser(updated);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  };

  const completeProfile = async (gender: "male" | "female", neighborhood?: string) => {
    const updated = user ? { ...user, gender, ...(neighborhood ? { neighborhood } : {}) } : user;
    if (updated) {
      setUser(updated);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  };

  const updateProfile = async (updates: { name?: string; avatar_url?: string | null }) => {
    const updated = user ? { ...user, ...updates } : user;
    if (updated) {
      setUser(updated);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  };

  const loginWithGoogle = async (_idToken: string) => { throw new Error("تسجيل Google غير متاح في هذه النسخة"); };
  const loginWithGoogleWeb = async () => { throw new Error("تسجيل Google غير متاح في هذه النسخة"); };
  const loginWithBiometrics = async () => false;
  const enableBiometrics = async (_identifier: string) => {};
  const disableBiometrics = async () => {};
  const refreshBackendToken = async () => token;

  return (
    <AuthContext.Provider value={{
      user, token, isLoading, isGuest, canPost,
      biometricsAvailable: false,
      biometricsEnabled: false,
      login, loginWithGoogle, loginWithGoogleWeb, loginWithBiometrics,
      loginAdmin, loginModerator, register, setUserGender, completeProfile, registerAdmin,
      enterAsGuest, logout, refreshUser, refreshBackendToken,
      enableBiometrics, disableBiometrics, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
