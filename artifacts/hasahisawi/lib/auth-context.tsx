import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import {
  firebaseLoginEmail,
  firebaseRegisterEmail,
  firebaseLogout,
  onFirebaseAuthChange,
} from "@/lib/firebase/auth";
import { fsSetDoc, fsGetDoc, COLLECTIONS } from "@/lib/firebase/firestore";
import { isFirebaseConfigured } from "@/lib/firebase/index";

export type AuthUser = {
  id: number;
  name: string;
  national_id_masked?: string | null;
  phone?: string | null;
  email?: string | null;
  role: "user" | "admin" | "moderator" | "guest";
  permissions?: string[];
  firebaseUid?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isGuest: boolean;
  canPost: boolean;
  login: (phoneOrEmail: string, password: string) => Promise<void>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  register: (name: string, nationalId: string, phoneOrEmail: string, isEmail: boolean, password: string, birthDate?: string, neighborhood?: string) => Promise<void>;
  registerAdmin: (name: string, email: string, password: string, adminCode: string) => Promise<void>;
  enterAsGuest: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "auth_session_token";
const USER_KEY  = "auth_user_data";
const GUEST_KEY = "auth_is_guest";

function apiUrl(path: string): string {
  return new URL(path, getApiUrl()).toString();
}

function looksLikeEmail(s: string): boolean {
  return s.includes("@");
}

// حوّل مستخدم Firebase إلى AuthUser
function fbUserToAuth(fbUser: any, extra?: Partial<AuthUser>): AuthUser {
  return {
    id: 0,
    name: fbUser.displayName ?? extra?.name ?? "مستخدم",
    email: fbUser.email ?? null,
    phone: fbUser.phoneNumber ?? null,
    role: "user",
    firebaseUid: fbUser.uid,
    ...extra,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const canPost = !isGuest && user !== null;

  // ── استعادة الجلسة عند البدء ───────────────────────────────
  useEffect(() => {
    let fbUnsub = () => {};

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

        if (isFirebaseConfigured) {
          // راقب حالة Firebase Auth في الخلفية
          fbUnsub = onFirebaseAuthChange(async (fbUser) => {
            if (fbUser) {
              // جلب بيانات الملف الشخصي من Firestore
              const profile = await fsGetDoc<Partial<AuthUser>>(COLLECTIONS.USERS, fbUser.uid).catch(() => null);
              setUser(fbUserToAuth(fbUser, profile ?? undefined));
              setToken(await fbUser.getIdToken());
              setIsGuest(false);
            } else if (!savedToken) {
              // لا Firebase ولا Express → يبقى بلا جلسة
              setUser(null);
              setToken(null);
            }
            setIsLoading(false);
          });
          // لا تنتظر — Firebase Auth ينهي الـ loading عبر الـ callback
          return;
        }

        // Express API fallback
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch {}
      setIsLoading(false);
    })();

    return () => fbUnsub();
  }, []);

  const saveExpressSession = async (u: AuthUser, t: string) => {
    setUser(u); setToken(t); setIsGuest(false);
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, t),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(u)),
      AsyncStorage.removeItem(GUEST_KEY),
    ]);
  };

  const enterAsGuest = () => {
    setIsGuest(true);
    setUser({ id: 0, name: "زائر", role: "guest" });
    setToken(null);
    AsyncStorage.setItem(GUEST_KEY, "1");
  };

  // ── تسجيل الدخول ──────────────────────────────────────────
  const login = async (phoneOrEmail: string, password: string) => {
    // Firebase Auth → للبريد الإلكتروني فقط
    if (isFirebaseConfigured && looksLikeEmail(phoneOrEmail)) {
      const fbUser = await firebaseLoginEmail(phoneOrEmail, password);
      const profile = await fsGetDoc<Partial<AuthUser>>(COLLECTIONS.USERS, fbUser.uid).catch(() => null);
      const authUser = fbUserToAuth(fbUser, profile ?? undefined);
      setUser(authUser);
      setToken(await fbUser.getIdToken());
      setIsGuest(false);
      await AsyncStorage.removeItem(GUEST_KEY);
      return;
    }

    // Express API → للهاتف أو عند عدم وجود Firebase
    const res = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_or_email: phoneOrEmail, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "فشل تسجيل الدخول");
    await saveExpressSession(json.user, json.token);
  };

  const loginAdmin = async (email: string, password: string) => {
    const res = await fetch(apiUrl("/api/auth/admin-login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "فشل تسجيل الدخول");
    await saveExpressSession(json.user, json.token);
  };

  // ── إنشاء حساب ────────────────────────────────────────────
  const register = async (
    name: string, nationalId: string,
    phoneOrEmail: string, isEmail: boolean, password: string,
    birthDate?: string, neighborhood?: string,
  ) => {
    if (!phoneOrEmail.trim()) throw new Error("يرجى إدخال البريد الإلكتروني أو رقم الهاتف");

    // Firebase Auth → للبريد الإلكتروني فقط
    if (isFirebaseConfigured && (isEmail || looksLikeEmail(phoneOrEmail))) {
      const fbUser = await firebaseRegisterEmail(phoneOrEmail.trim(), password, name);
      const profileData: Partial<AuthUser> = {
        name,
        email: phoneOrEmail.trim(),
        role: "user",
        ...(nationalId ? { national_id_masked: nationalId.slice(-4).padStart(nationalId.length, "*") } : {}),
      };
      await fsSetDoc(COLLECTIONS.USERS, fbUser.uid, {
        ...profileData, uid: fbUser.uid,
        ...(birthDate ? { birth_date: birthDate } : {}),
        ...(neighborhood ? { neighborhood } : {}),
      });
      const authUser = fbUserToAuth(fbUser, profileData);
      setUser(authUser);
      setToken(await fbUser.getIdToken());
      setIsGuest(false);
      await AsyncStorage.removeItem(GUEST_KEY);
      return;
    }

    // Express API → للهاتف
    const body: Record<string, string> = { name, password };
    if (nationalId)   body.national_id  = nationalId;
    if (isEmail)      body.email        = phoneOrEmail;
    else              body.phone        = phoneOrEmail;
    if (birthDate)    body.birth_date   = birthDate;
    if (neighborhood) body.neighborhood = neighborhood;
    const res = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "فشل التسجيل");
    await saveExpressSession(json.user, json.token);
  };

  const registerAdmin = async (name: string, email: string, password: string, adminCode: string) => {
    const res = await fetch(apiUrl("/api/auth/register-admin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, admin_code: adminCode }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "فشل تسجيل المشرف");
    await saveExpressSession(json.user, json.token);
  };

  const refreshUser = async () => {
    if (isFirebaseConfigured && user?.firebaseUid) {
      const profile = await fsGetDoc<Partial<AuthUser>>(COLLECTIONS.USERS, user.firebaseUid).catch(() => null);
      if (profile) setUser(u => u ? { ...u, ...profile } : u);
      return;
    }
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

  const logout = async () => {
    if (isFirebaseConfigured && user?.firebaseUid) {
      await firebaseLogout().catch(() => {});
    } else if (token) {
      try {
        await fetch(apiUrl("/api/auth/logout"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    setUser(null); setToken(null); setIsGuest(false);
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(GUEST_KEY),
    ]);
  };

  return (
    <AuthContext.Provider value={{
      user, token, isLoading, isGuest, canPost,
      login, loginAdmin, register, registerAdmin,
      enterAsGuest, logout, refreshUser,
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
