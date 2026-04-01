import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isBiometricsAvailable,
  isBiometricsEnabled,
  setBiometricsEnabled,
  saveBiometricIdentifier,
  authenticate,
} from "@/lib/biometrics";
import {
  firebaseLoginEmail,
  firebaseRegisterEmail,
  firebaseLogout,
  onFirebaseAuthChange,
  getCurrentFirebaseUser,
  isFirebaseAvailable,
} from "@/lib/firebase/auth";
import { fsSetDoc, fsGetDoc, COLLECTIONS } from "@/lib/firebase/firestore";
import { isFirebaseConfigured } from "@/lib/firebase/index";
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
};

type UserProfile = {
  uid: string;
  name: string;
  nationalId?: string;
  phone?: string;
  email?: string;
  role: "user" | "admin" | "moderator";
  permissions: string[];
  neighborhood?: string;
  birthDate?: string;
  createdAt?: unknown;
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
  updateProfile: (updates: { name?: string; avatar_url?: string | null }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY        = "auth_session_token";
const BACKEND_TOKEN_KEY = "auth_backend_token";
const USER_KEY          = "auth_user_data";
const GUEST_KEY         = "auth_is_guest";
const IDENTIFIER_KEY    = "auth_biometric_identifier";
const PASSWORD_KEY      = "auth_biometric_password";

const ADMIN_CODE = "HASAHISA_ADMIN_2026";

function phoneToEmail(phone: string): string {
  const clean = phone.replace(/\s+/g, "").replace(/^\+/, "");
  return `${clean}@hasahisawi.app`;
}

function identifierToEmail(phoneOrEmail: string): string {
  const trimmed = phoneOrEmail.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return phoneToEmail(trimmed);
}

function maskNationalId(id?: string): string | null {
  if (!id || id.length < 4) return id ?? null;
  return "*".repeat(id.length - 4) + id.slice(-4);
}

async function backendLogin(phoneOrEmail: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const base = getApiUrl();
  if (!base) throw new Error("الخادم غير متاح");
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_or_email: phoneOrEmail, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "بيانات غير صحيحة");
  const u = json.user;
  const authUser: AuthUser = {
    id: u.id,
    name: u.name,
    phone: u.phone ?? null,
    email: u.email ?? null,
    role: u.role ?? "user",
    neighborhood: u.neighborhood ?? null,
    national_id_masked: u.national_id_masked ?? null,
    avatar_url: u.avatar_url ?? null,
  };
  return { user: authUser, token: json.token };
}

async function backendRegister(
  name: string,
  phoneOrEmail: string,
  password: string,
  nationalId?: string,
  birthDate?: string,
  neighborhood?: string,
): Promise<{ user: AuthUser; token: string }> {
  const base = getApiUrl();
  if (!base) throw new Error("الخادم غير متاح");
  const isEmail = phoneOrEmail.includes("@");
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      phone: isEmail ? undefined : phoneOrEmail,
      email: isEmail ? phoneOrEmail : undefined,
      password,
      national_id: nationalId || undefined,
      birth_date: birthDate || undefined,
      neighborhood: neighborhood || undefined,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "فشل إنشاء الحساب");
  const u = json.user;
  const authUser: AuthUser = {
    id: u.id,
    name: u.name,
    phone: u.phone ?? null,
    email: u.email ?? null,
    role: u.role ?? "user",
    neighborhood: u.neighborhood ?? null,
    national_id_masked: u.national_id_masked ?? null,
    avatar_url: u.avatar_url ?? null,
  };
  return { user: authUser, token: json.token };
}

async function exchangeForBackendToken(
  firebase_uid: string,
  name: string,
  email: string | null,
  role: string,
): Promise<string | null> {
  try {
    const base = getApiUrl();
    if (!base) return null;
    const res = await fetch(`${base}/api/auth/firebase-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firebase_uid, name, email, role }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

function profileToAuthUser(profile: UserProfile, idToken: string): AuthUser {
  return {
    id: 0,
    uid: profile.uid,
    name: profile.name,
    national_id_masked: maskNationalId(profile.nationalId),
    phone: profile.phone ?? null,
    email: profile.email ?? null,
    role: profile.role,
    permissions: profile.permissions ?? [],
    neighborhood: profile.neighborhood ?? null,
    avatar_url: null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);

  const canPost = !isGuest && user !== null;

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

  // ── استعادة الجلسة المحفوظة في التخزين المحلي ──────────────────
  const restoreLocalSession = async () => {
    try {
      const [savedGuest, savedToken, savedUser] = await Promise.all([
        AsyncStorage.getItem(GUEST_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      if (savedGuest === "1") {
        setIsGuest(true);
        setUser({ id: 0, name: "زائر", role: "guest" });
      } else if (savedToken && savedUser) {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
        setIsGuest(false);
      }
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => {
    // إذا لم يكن Firebase مُهيَّئاً → استعِد الجلسة المحلية مباشرة
    if (!isFirebaseConfigured) {
      restoreLocalSession();
      return;
    }

    let unsub: (() => void) | undefined;
    try {
      unsub = onFirebaseAuthChange(async (fbUser) => {
        try {
          const savedGuest = await AsyncStorage.getItem(GUEST_KEY);

          if (savedGuest === "1" && !fbUser) {
            setIsGuest(true);
            setUser({ id: 0, name: "زائر", role: "guest" });
            setIsLoading(false);
            return;
          }

          if (!fbUser) {
            // Firebase لا يوجد مستخدم — هل يوجد جلسة محفوظة؟
            const [savedToken, savedUser] = await Promise.all([
              AsyncStorage.getItem(TOKEN_KEY),
              AsyncStorage.getItem(USER_KEY),
            ]);
            if (savedToken && savedUser) {
              // جلسة بكند محفوظة → استعدها دون Firebase
              setUser(JSON.parse(savedUser));
              setToken(savedToken);
              setIsGuest(false);
              setIsLoading(false);
              return;
            }
            // تحقق من البيومترية
            const bioEnabled = await isBiometricsEnabled();
            const bioAvailable = await isBiometricsAvailable();
            if (bioEnabled && bioAvailable) {
              setIsLoading(false);
              return;
            }
            setUser(null);
            setToken(null);
            setIsLoading(false);
            return;
          }

          const bioEnabled = await isBiometricsEnabled();
          const bioAvailable = await isBiometricsAvailable();
          if (bioEnabled && bioAvailable) {
            setIsLoading(false);
            return;
          }

          const idToken = await fbUser.getIdToken();
          const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid);

          if (profile) {
            const authUser = profileToAuthUser(profile, idToken);
            setUser(authUser);
            setToken(idToken);
            setIsGuest(false);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(authUser));
            await AsyncStorage.setItem(TOKEN_KEY, idToken);
            await AsyncStorage.removeItem(GUEST_KEY);
          } else {
            await firebaseLogout();
            setUser(null);
            setToken(null);
          }
        } catch {
          // فشل داخلي — استعِد الجلسة المحلية كبديل
          await restoreLocalSession();
          return;
        }
        setIsLoading(false);
      });
    } catch (e) {
      console.warn("[Auth] Firebase listener setup failed:", e);
      // Firebase فشل كلياً → استعِد الجلسة المحلية
      restoreLocalSession();
    }

    return () => { try { unsub?.(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSession = async (u: AuthUser, firebaseIdToken: string, backendTok?: string | null) => {
    const effectiveToken = backendTok || firebaseIdToken;
    setUser(u);
    setToken(effectiveToken);
    setIsGuest(false);
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, effectiveToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(u)),
      AsyncStorage.removeItem(GUEST_KEY),
      backendTok
        ? AsyncStorage.setItem(BACKEND_TOKEN_KEY, backendTok)
        : AsyncStorage.removeItem(BACKEND_TOKEN_KEY),
    ]);
  };

  const clearSession = async () => {
    setUser(null);
    setToken(null);
    setIsGuest(false);
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(BACKEND_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(GUEST_KEY),
      AsyncStorage.removeItem(PASSWORD_KEY),
    ]);
  };

  const enterAsGuest = () => {
    setIsGuest(true);
    setUser({ id: 0, name: "زائر", role: "guest" });
    setToken(null);
    AsyncStorage.setItem(GUEST_KEY, "1");
  };

  const loginWithBiometrics = async (): Promise<boolean> => {
    try {
      const success = await authenticate("تحقق من هويتك للدخول إلى حصاحيصاوي");
      if (!success) return false;

      const [savedIdentifier, savedPassword] = await Promise.all([
        AsyncStorage.getItem(IDENTIFIER_KEY),
        AsyncStorage.getItem(PASSWORD_KEY),
      ]);

      if (savedIdentifier && savedPassword) {
        await login(savedIdentifier, savedPassword);
        return true;
      }

      const [savedToken, savedUser] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setIsGuest(false);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  const login = async (phoneOrEmail: string, password: string) => {
    // Backend هو المصدر الأساسي للمصادقة دائماً
    const { user: authUser, token: backendTok } = await backendLogin(phoneOrEmail, password);
    await saveSession(authUser, backendTok, backendTok);
    // Firebase اختياري — نجرّبه في الخلفية فقط لمزامنة البيانات
    if (isFirebaseAvailable()) {
      try {
        const email = identifierToEmail(phoneOrEmail);
        const fbUser = await firebaseLoginEmail(email, password);
        const idToken = await fbUser.getIdToken();
        const backendTok2 = await exchangeForBackendToken(
          fbUser.uid, authUser.name, authUser.email ?? null, authUser.role
        );
        if (backendTok2) {
          setToken(backendTok2);
          await AsyncStorage.setItem(TOKEN_KEY, backendTok2);
        }
      } catch {
        // Firebase فشل — لا بأس، جلسة backend نشطة
      }
    }
  };

  const loginAdmin = async (email: string, password: string) => {
    const fbUser = await firebaseLoginEmail(email.trim().toLowerCase(), password);
    const idToken = await fbUser.getIdToken();

    const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid);
    if (!profile) throw new Error("لم يُعثر على بيانات الحساب.");
    if (profile.role !== "admin" && profile.role !== "moderator") {
      await firebaseLogout();
      throw new Error("هذا الحساب لا يملك صلاحيات الإدارة.");
    }

    const authUser = profileToAuthUser(profile, idToken);
    const backendTok = await exchangeForBackendToken(
      fbUser.uid, authUser.name, authUser.email ?? null, authUser.role
    );
    await saveSession(authUser, idToken, backendTok);
  };

  const register = async (
    name: string,
    nationalId: string,
    phoneOrEmail: string,
    isEmail: boolean,
    password: string,
    birthDate?: string,
    neighborhood?: string,
  ) => {
    // Backend هو المصدر الأساسي للتسجيل دائماً
    const { user: authUser, token: backendTok } = await backendRegister(
      name, phoneOrEmail, password, nationalId || undefined, birthDate, neighborhood
    );
    await saveSession(authUser, backendTok, backendTok);
    // Firebase اختياري — نجرّبه في الخلفية للمزامنة فقط
    if (isFirebaseAvailable()) {
      try {
        const email = identifierToEmail(phoneOrEmail);
        const isActualEmail = isEmail || phoneOrEmail.includes("@");
        const fbUser = await firebaseRegisterEmail(email, password, name);
        const idToken = await fbUser.getIdToken();
        const profile: UserProfile = {
          uid: fbUser.uid,
          name: name.trim(),
          role: "user",
          permissions: [],
          ...(nationalId ? { nationalId } : {}),
          ...(isActualEmail
            ? { email: phoneOrEmail.trim().toLowerCase() }
            : { phone: phoneOrEmail.trim() }),
          ...(neighborhood ? { neighborhood } : {}),
          ...(birthDate ? { birthDate } : {}),
        };
        await fsSetDoc(COLLECTIONS.USERS, fbUser.uid, profile, false);
        const backendTok2 = await exchangeForBackendToken(
          fbUser.uid, authUser.name, authUser.email ?? null, "user"
        );
        if (backendTok2) {
          setToken(backendTok2);
          await AsyncStorage.setItem(TOKEN_KEY, backendTok2);
        }
      } catch {
        // Firebase فشل — لا بأس، جلسة backend نشطة
      }
    }
  };

  const registerAdmin = async (
    name: string,
    email: string,
    password: string,
    adminCode: string,
  ) => {
    if (adminCode !== ADMIN_CODE) {
      throw new Error("رمز المسؤول غير صحيح.");
    }

    const fbUser = await firebaseRegisterEmail(
      email.trim().toLowerCase(),
      password,
      name,
    );
    const idToken = await fbUser.getIdToken();

    const profile: UserProfile = {
      uid: fbUser.uid,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: "admin",
      permissions: ["manage_users", "manage_content", "manage_notifications"],
    };

    await fsSetDoc(COLLECTIONS.USERS, fbUser.uid, profile, false);

    const authUser = profileToAuthUser(profile, idToken);
    await saveSession(authUser, idToken);
  };

  const enableBiometrics = async (identifier: string) => {
    await setBiometricsEnabled(true);
    await saveBiometricIdentifier(identifier);
    setBiometricsEnabledState(true);
  };

  const disableBiometrics = async () => {
    await setBiometricsEnabled(false);
    setBiometricsEnabledState(false);
    await AsyncStorage.removeItem(PASSWORD_KEY);
  };

  const refreshUser = async () => {
    const fbUser = getCurrentFirebaseUser();
    if (!fbUser) return;
    try {
      const idToken = await fbUser.getIdToken(true);
      const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid);
      if (profile) {
        const authUser = profileToAuthUser(profile, idToken);
        setUser(authUser);
        setToken(idToken);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(authUser));
        await AsyncStorage.setItem(TOKEN_KEY, idToken);
      }
    } catch {}
  };

  const logout = async () => {
    try { await firebaseLogout(); } catch {}
    await clearSession();
  };

  const updateProfile = async (updates: { name?: string; avatar_url?: string | null }) => {
    const backendToken = token;
    if (!backendToken) throw new Error("غير مصرح");
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const res = await fetch(`${base}/api/auth/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${backendToken}` },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "فشل التحديث");
    const u = json.user;
    const updated: AuthUser = {
      ...(user ?? { id: 0, name: "", role: "user" }),
      ...u,
      avatar_url: u.avatar_url ?? null,
    };
    setUser(updated);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider
      value={{
        user, token, isLoading, isGuest, canPost,
        biometricsAvailable, biometricsEnabled,
        login, loginWithBiometrics, loginAdmin, register, registerAdmin,
        enterAsGuest, logout, refreshUser,
        enableBiometrics, disableBiometrics,
        updateProfile,
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
