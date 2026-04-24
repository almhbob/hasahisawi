import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
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
  firebaseLoginGoogle,
  firebaseLoginGoogleWeb,
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
  gender?: "male" | "female" | null;
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
  ) => Promise<void>;
  setUserGender: (gender: "male" | "female") => Promise<void>;
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

/**
 * يُرسل طلباً مع timeout وإعادة المحاولة التلقائية عند فشل الخادم.
 * يحل مشكلة cold-start في Render وأي استجابة غير JSON.
 *
 * @param url     - عنوان الطلب
 * @param options - خيارات fetch
 * @param retries - عدد المحاولات (افتراضي 3)
 * @param timeoutMs - مهلة كل محاولة بالمللي ثانية (افتراضي 45 ثانية)
 */
async function safeFetchJson(
  url: string,
  options: RequestInit,
  retries = 3,
  timeoutMs = 45000,
): Promise<{ res: Response; json: Record<string, unknown> }> {
  let lastError: Error = new Error("الخادم غير متاح مؤقتاً، حاول مجدداً");

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(tid);
    } catch (err: any) {
      clearTimeout(tid);
      if (err?.name === "AbortError") {
        lastError = new Error("انتهت مهلة الاتصال — تحقق من الإنترنت وأعد المحاولة");
      } else {
        lastError = new Error("تعذّر الاتصال بالخادم — تحقق من الإنترنت");
      }
      continue;
    }

    let text = "";
    try {
      text = await res.text();
    } catch {
      lastError = new Error("تعذّر قراءة رد الخادم — تحقق من الإنترنت");
      continue;
    }

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      // أي استجابة غير JSON مشكلة مؤقتة — نُعيد المحاولة دائماً
      lastError = new Error(
        res.status >= 500 || text.trim().startsWith("<")
          ? "الخادم يستيقظ، جاري إعادة المحاولة…"
          : res.status >= 400
            ? `خطأ في الخادم (${res.status}) — جاري إعادة المحاولة`
            : "الخادم يستيقظ، جاري إعادة المحاولة…",
      );
      continue;
    }

    return { res, json };
  }

  throw lastError;
}

async function backendLogin(phoneOrEmail: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const base = getApiUrl();
  if (!base) throw new Error("الخادم غير متاح");

  const { res, json } = await safeFetchJson(
    `${base}/api/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_or_email: phoneOrEmail, password }),
    },
  );

  if (!res.ok) throw new Error((json.error as string) || "بيانات غير صحيحة");
  const u = json.user as Record<string, unknown>;
  const authUser: AuthUser = {
    id: u.id as number,
    name: u.name as string,
    phone: (u.phone as string | null) ?? null,
    email: (u.email as string | null) ?? null,
    role: (u.role as AuthUser["role"]) ?? "user",
    neighborhood: (u.neighborhood as string | null) ?? null,
    national_id_masked: (u.national_id_masked as string | null) ?? null,
    avatar_url: (u.avatar_url as string | null) ?? null,
    gender: (u.gender as "male" | "female" | null) ?? null,
  };
  return { user: authUser, token: json.token as string };
}

async function backendRegister(
  name: string,
  phoneOrEmail: string,
  password: string,
  nationalId?: string,
  birthDate?: string,
  neighborhood?: string,
  gender?: string,
): Promise<{ user: AuthUser; token: string }> {
  const base = getApiUrl();
  if (!base) throw new Error("الخادم غير متاح");
  const isEmail = phoneOrEmail.includes("@");

  const { res, json } = await safeFetchJson(
    `${base}/api/auth/register`,
    {
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
        gender: gender || undefined,
      }),
    },
  );

  if (!res.ok) throw new Error((json.error as string) || "فشل إنشاء الحساب");
  const u = json.user as Record<string, unknown>;
  const authUser: AuthUser = {
    id: u.id as number,
    name: u.name as string,
    phone: (u.phone as string | null) ?? null,
    email: (u.email as string | null) ?? null,
    role: (u.role as AuthUser["role"]) ?? "user",
    neighborhood: (u.neighborhood as string | null) ?? null,
    national_id_masked: (u.national_id_masked as string | null) ?? null,
    avatar_url: (u.avatar_url as string | null) ?? null,
    gender: (u.gender as "male" | "female" | null) ?? null,
  };
  return { user: authUser, token: json.token as string };
}

async function exchangeForBackendToken(
  firebase_uid: string,
  name: string,
  email: string | null,
  role: string,
  idToken?: string | null,
): Promise<string | null> {
  try {
    const base = getApiUrl();
    if (!base) return null;
    const { res, json } = await safeFetchJson(
      `${base}/api/auth/firebase-exchange`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, firebase_uid, name, email, role }),
      },
      2, // محاولتان فقط — استدعاء خلفي
    );
    if (!res.ok) return null;
    return (json as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

function profileToAuthUser(profile: UserProfile, _idToken: string): AuthUser {
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
    try {
      GoogleSignin.configure({
        webClientId: "133656291161-kajn1h6a40oriel45qsb4douvl8apm5e.apps.googleusercontent.com",
        offlineAccess: false,
      });
    } catch {}
  }, []);

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
        const parsedUser = JSON.parse(savedUser) as AuthUser;
        setUser(parsedUser);
        setToken(savedToken);
        setIsGuest(false);
        // إذا كان مستخدم Google (له uid)، جدّد backend token في الخلفية بهدوء
        if (parsedUser.uid) {
          exchangeForBackendToken(
            parsedUser.uid,
            parsedUser.name,
            parsedUser.email ?? null,
            parsedUser.role,
          ).then((freshTok) => {
            if (freshTok) {
              setToken(freshTok);
              AsyncStorage.setItem(TOKEN_KEY, freshTok).catch(() => {});
            }
          }).catch(() => {});
        }
      }
    } catch {}
    setIsLoading(false);
  };

  useEffect(() => {
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
            const [savedToken, savedUser] = await Promise.all([
              AsyncStorage.getItem(TOKEN_KEY),
              AsyncStorage.getItem(USER_KEY),
            ]);
            if (savedToken && savedUser) {
              const parsedUser = JSON.parse(savedUser) as AuthUser;
              setUser(parsedUser);
              setToken(savedToken);
              setIsGuest(false);
              setIsLoading(false);
              // جدّد backend token في الخلفية لمستخدمي Google
              if (parsedUser.uid) {
                exchangeForBackendToken(
                  parsedUser.uid,
                  parsedUser.name,
                  parsedUser.email ?? null,
                  parsedUser.role,
                ).then((freshTok) => {
                  if (freshTok) {
                    setToken(freshTok);
                    AsyncStorage.setItem(TOKEN_KEY, freshTok).catch(() => {});
                  }
                }).catch(() => {});
              }
              return;
            }
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

          // Check if there's already a valid backend session saved
          const [savedToken, savedUser] = await Promise.all([
            AsyncStorage.getItem(TOKEN_KEY),
            AsyncStorage.getItem(USER_KEY),
          ]);

          const isBackendToken = !!(savedToken && savedToken.length === 64 && !savedToken.includes("."));

          if (isBackendToken && savedToken && savedUser) {
            // Restore session immediately for fast startup
            setUser(JSON.parse(savedUser));
            setToken(savedToken);
            setIsGuest(false);
            setIsLoading(false);

            // Sync user to PostgreSQL in background (ensures all Firebase users appear in admin)
            (async () => {
              try {
                const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid);
                if (profile) {
                  const newToken = await exchangeForBackendToken(
                    fbUser.uid, profile.name, fbUser.email ?? null, profile.role
                  );
                  if (newToken && newToken !== savedToken) {
                    await AsyncStorage.setItem(TOKEN_KEY, newToken);
                    setToken(newToken);
                  }
                }
              } catch {}
            })();
            return;
          }

          const idToken = await fbUser.getIdToken();
          const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid);

          if (profile) {
            const authUser = profileToAuthUser(profile, idToken);
            // Exchange Firebase token for backend session token
            const backendTok = await exchangeForBackendToken(
              fbUser.uid, profile.name, fbUser.email ?? null, profile.role, idToken
            );
            setUser(authUser);
            setIsGuest(false);
            if (backendTok) {
              setToken(backendTok);
              await AsyncStorage.setItem(TOKEN_KEY, backendTok);
            }
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(authUser));
            await AsyncStorage.removeItem(GUEST_KEY);
          } else {
            await firebaseLogout();
            setUser(null);
            setToken(null);
          }
        } catch {
          await restoreLocalSession();
          return;
        }
        setIsLoading(false);
      });
    } catch (e) {
      console.warn("[Auth] Firebase listener setup failed:", e);
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

  // مساعد داخلي يكمل تدفق الدخول بعد أي طريقة Google (native أو web)
  const finalizeGoogleLogin = async (
    fbUser: import("firebase/auth").User
  ) => {
    // Firestore مع مهلة 6 ثوانٍ — إن تأخر نُكمل من بيانات Firebase مباشرة
    const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid, 6000).catch(() => null);
    let authUser: AuthUser;
    if (profile) {
      const backendIdToken = await fbUser.getIdToken();
      authUser = profileToAuthUser(profile, backendIdToken);
    } else {
      const newProfile: UserProfile = {
        uid: fbUser.uid,
        name: fbUser.displayName || "مستخدم Google",
        email: fbUser.email || undefined,
        role: "user",
        permissions: [],
      };
      // حفظ الملف الشخصي بشكل غير متزامن — لا نُوقف تدفق الدخول
      fsSetDoc(COLLECTIONS.USERS, fbUser.uid, newProfile, false).catch(() => {});
      authUser = profileToAuthUser(newProfile, "");
      authUser.email = fbUser.email ?? null;
      authUser.avatar_url = fbUser.photoURL ?? null;
    }
    const idTok = await fbUser.getIdToken();
    const backendTok = await exchangeForBackendToken(
      fbUser.uid, authUser.name, fbUser.email ?? null, authUser.role, idTok
    );
    await saveSession(authUser, idTok, backendTok);
  };

  const loginWithGoogle = async (idToken: string) => {
    if (!isFirebaseAvailable()) throw new Error("Firebase غير متاح للدخول عبر Google");
    const fbUser = await firebaseLoginGoogle(idToken);
    await finalizeGoogleLogin(fbUser);
  };

  const loginWithGoogleWeb = async () => {
    if (!isFirebaseAvailable()) throw new Error("Firebase غير متاح للدخول عبر Google");
    const fbUser = await firebaseLoginGoogleWeb();
    await finalizeGoogleLogin(fbUser);
  };

  const login = async (phoneOrEmail: string, password: string) => {
    // 🔥 Firebase Auth أولاً — سريع وموثوق ولا يعتمد على Render
    if (isFirebaseAvailable()) {
      try {
        const email = identifierToEmail(phoneOrEmail);
        const fbUser = await firebaseLoginEmail(email, password);
        const idToken = await fbUser.getIdToken();

        // اقرأ الملف الشخصي من Firestore (إن وُجد)
        const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid).catch(() => null);

        // تبادل التوكن مع الخادم للحصول على backend token (يبني صف users إن لزم)
        const backendTok = await exchangeForBackendToken(
          fbUser.uid,
          profile?.name ?? fbUser.displayName ?? "مستخدم",
          fbUser.email && !fbUser.email.includes("@hasahisawi.app") ? fbUser.email : email,
          profile?.role ?? "user",
          idToken,
        );

        const authUser: AuthUser = profile
          ? profileToAuthUser(profile, idToken)
          : {
              id: 0,
              uid: fbUser.uid,
              name: fbUser.displayName ?? "مستخدم",
              phone: fbUser.email?.includes("@hasahisawi.app") ? fbUser.email.split("@")[0] : null,
              email: fbUser.email && !fbUser.email.includes("@hasahisawi.app") ? fbUser.email : null,
              role: "user",
              avatar_url: null,
              gender: null,
            };
        await saveSession(authUser, backendTok ?? idToken, backendTok);
        return;
      } catch (fbErr: any) {
        const code = fbErr?.code ?? "";
        const msg = fbErr?.message ?? "";
        // أخطاء بيانات اعتماد واضحة → أعرضها للمستخدم
        if (code === "auth/wrong-password" || code === "auth/user-not-found" ||
            code === "auth/invalid-credential" || code === "auth/invalid-email" ||
            msg.includes("wrong-password") || msg.includes("user-not-found") || msg.includes("invalid-credential")) {
          // قد يكون الحساب في Backend فقط (مستخدمون قدامى) — جرّب backend كـ fallback
          try {
            const { user: authUser, token: backendTok } = await backendLogin(phoneOrEmail, password);
            await saveSession(authUser, backendTok, backendTok);
            // أنشئ حساب Firebase موازي للمستخدم القديم
            try {
              const email = identifierToEmail(phoneOrEmail);
              await firebaseRegisterEmail(email, password, authUser.name).catch(async () => {
                await firebaseLoginEmail(email, password);
              });
            } catch {}
            return;
          } catch {
            throw new Error("بيانات الدخول غير صحيحة");
          }
        }
        // مشاكل شبكة أو خدمة Firebase → جرّب backend كـ fallback
      }
    }

    // Fallback: backend (للمستخدمين القدامى فقط)
    const { user: authUser, token: backendTok } = await backendLogin(phoneOrEmail, password);
    await saveSession(authUser, backendTok, backendTok);
  };

  const loginAdmin = async (email: string, password: string) => {
    const base = getApiUrl();
    if (base) {
      try {
        const { res, json } = await safeFetchJson(
          `${base}/api/auth/admin-login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
          },
        );
        if (res.ok) {
          const u = json.user as Record<string, unknown>;
          const authUser: AuthUser = {
            id: u.id as number,
            name: u.name as string,
            phone: (u.phone as string | null) ?? null,
            email: (u.email as string | null) ?? null,
            role: (u.role as AuthUser["role"]) ?? "admin",
            neighborhood: null,
            national_id_masked: null,
            avatar_url: null,
          };
          await saveSession(authUser, json.token as string, json.token as string);
          return;
        }
        if (res.status === 401) throw new Error((json.error as string) || "بيانات غير صحيحة");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "بيانات غير صحيحة") throw err;
        // Server unavailable — try Firebase
      }
    }

    // Firebase fallback
    if (isFirebaseAvailable()) {
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
        fbUser.uid, authUser.name, authUser.email ?? null, authUser.role, idToken
      );
      await saveSession(authUser, idToken, backendTok);
      return;
    }

    throw new Error("تعذّر الاتصال بالخادم");
  };

  const loginModerator = async (phoneOrEmail: string, password: string) => {
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const { res, json } = await safeFetchJson(
      `${base}/api/auth/moderator-login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_or_email: phoneOrEmail.trim(), password }),
      },
    );
    if (!res.ok) throw new Error((json.error as string) || "بيانات غير صحيحة");
    const u = json.user as Record<string, unknown>;
    const authUser: AuthUser = {
      id: u.id as number,
      name: u.name as string,
      phone: (u.phone as string | null) ?? null,
      email: (u.email as string | null) ?? null,
      role: "moderator",
      permissions: (u.permissions as string[]) ?? [],
      neighborhood: (u.neighborhood as string | null) ?? null,
      national_id_masked: null,
      avatar_url: null,
    };
    await saveSession(authUser, json.token as string, json.token as string);
  };

  const setUserGender = async (gender: "male" | "female") => {
    const base = getApiUrl();
    if (!base || !token) throw new Error("غير مصرح");
    const { res, json } = await safeFetchJson(
      `${base}/api/auth/me/gender`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gender }),
      },
    );
    if (!res.ok) throw new Error((json.error as string) || "تعذّر تحديث الجنس");
    setUser(prev => prev ? { ...prev, gender } : prev);
  };

  const register = async (
    name: string,
    nationalId: string,
    phoneOrEmail: string,
    isEmail: boolean,
    password: string,
    birthDate?: string,
    neighborhood?: string,
    gender?: string,
  ) => {
    const isActualEmail = isEmail || phoneOrEmail.includes("@");

    // 🔥 Firebase Auth أولاً — سريع وموثوق
    if (isFirebaseAvailable()) {
      try {
        const firebaseEmail = identifierToEmail(phoneOrEmail);

        let fbUser: import("firebase/auth").User;
        try {
          fbUser = await firebaseRegisterEmail(firebaseEmail, password, name);
        } catch (regErr: any) {
          const code = regErr?.code ?? "";
          if (code === "auth/email-already-in-use") {
            throw new Error(
              isActualEmail
                ? "هذا البريد مسجّل مسبقاً، يرجى تسجيل الدخول"
                : "هذا الرقم مسجّل مسبقاً، يرجى تسجيل الدخول"
            );
          }
          if (code === "auth/weak-password") {
            throw new Error("كلمة المرور ضعيفة (6 أحرف على الأقل)");
          }
          if (code === "auth/invalid-email") {
            throw new Error("صيغة البريد/الهاتف غير صحيحة");
          }
          throw regErr;
        }

        // احفظ الملف الشخصي في Firestore
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
        await fsSetDoc(COLLECTIONS.USERS, fbUser.uid, profile, false).catch(() => {});

        const idToken = await fbUser.getIdToken();
        // تبادل التوكن مع الخادم (يبني صف users في Postgres تلقائياً)
        const backendTok = await exchangeForBackendToken(
          fbUser.uid,
          name.trim(),
          isActualEmail ? phoneOrEmail.trim().toLowerCase() : firebaseEmail,
          "user",
          idToken,
        );

        // في الخلفية: حاول إنشاء صف Backend كامل بكل الحقول (national_id, birth_date, ...)
        // لو فشل، لا بأس — exchange أنشأ صفاً أساسياً
        backendRegister(
          name, phoneOrEmail, password, nationalId || undefined, birthDate, neighborhood, gender
        ).catch(() => {});

        const authUser: AuthUser = {
          id: 0,
          uid: fbUser.uid,
          name: name.trim(),
          national_id_masked: maskNationalId(nationalId),
          phone: isActualEmail ? null : phoneOrEmail.trim(),
          email: isActualEmail ? phoneOrEmail.trim().toLowerCase() : null,
          role: "user",
          neighborhood: neighborhood ?? null,
          avatar_url: null,
          gender: (gender as "male" | "female") ?? null,
        };
        await saveSession(authUser, backendTok ?? idToken, backendTok);
        return;
      } catch (fbErr: any) {
        // أخطاء بيانات → ارفعها للمستخدم
        if (fbErr instanceof Error && (
          fbErr.message.includes("مسجّل مسبقاً") ||
          fbErr.message.includes("ضعيفة") ||
          fbErr.message.includes("غير صحيحة")
        )) throw fbErr;
        // غير ذلك (شبكة Firebase) → جرّب backend كـ fallback
      }
    }

    // Fallback: backend مباشرة
    const { user: authUser, token: backendTok } = await backendRegister(
      name, phoneOrEmail, password, nationalId || undefined, birthDate, neighborhood, gender
    );
    await saveSession(authUser, backendTok, backendTok);
  };

  const registerAdmin = async (
    name: string,
    email: string,
    password: string,
    adminCode: string,
  ) => {
    // Register in backend first (uses admin PIN as admin_code)
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const { res, json } = await safeFetchJson(
      `${base}/api/auth/register-admin`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email.trim().toLowerCase(), password, admin_code: adminCode }),
      },
    );
    if (!res.ok) throw new Error((json.error as string) || "فشل إنشاء حساب المشرف");

    const backendTok = json.token as string;
    const u = json.user as Record<string, unknown>;
    const authUser: AuthUser = {
      id: u.id as number,
      name: (u.name as string) || name,
      email: email.trim().toLowerCase(),
      phone: null,
      role: "admin",
      avatar_url: null,
    };
    await saveSession(authUser, backendTok, backendTok);

    // Firebase optional sync
    if (isFirebaseAvailable()) {
      try {
        const fbUser = await firebaseRegisterEmail(email.trim().toLowerCase(), password, name);
        const profile: UserProfile = {
          uid: fbUser.uid,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: "admin",
          permissions: ["manage_users", "manage_content", "manage_notifications"],
        };
        await fsSetDoc(COLLECTIONS.USERS, fbUser.uid, profile, false);
        await exchangeForBackendToken(fbUser.uid, name, email.trim().toLowerCase(), "admin");
      } catch {
        // Firebase optional
      }
    }
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
    // Try backend first
    const currentToken = token || await AsyncStorage.getItem(TOKEN_KEY);
    if (currentToken) {
      try {
        const base = getApiUrl();
        if (base) {
          const { res, json } = await safeFetchJson(
            `${base}/api/auth/me`,
            { headers: { Authorization: `Bearer ${currentToken}` } },
            2,
          );
          if (res.ok) {
            const u = (json as { user: Record<string, unknown> }).user;
            const updated: AuthUser = {
              id: u.id as number,
              name: u.name as string,
              phone: (u.phone as string | null) ?? null,
              email: (u.email as string | null) ?? null,
              role: (u.role as AuthUser["role"]) ?? "user",
              permissions: (u.permissions as string[]) ?? [],
              neighborhood: (u.neighborhood as string | null) ?? null,
              national_id_masked: (u.national_id_masked as string | null) ?? null,
              avatar_url: (u.avatar_url as string | null) ?? null,
            };
            setUser(updated);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
            return;
          }
        }
      } catch {}
    }

    // Firebase fallback
    const fbUser = getCurrentFirebaseUser();
    if (!fbUser) return;
    try {
      const idToken = await fbUser.getIdToken(true);
      const profile = await fsGetDoc<UserProfile>(COLLECTIONS.USERS, fbUser.uid);
      if (profile) {
        const authUser = profileToAuthUser(profile, idToken);
        const backendTok = await exchangeForBackendToken(
          fbUser.uid, profile.name, fbUser.email ?? null, profile.role, idToken
        );
        setUser(authUser);
        if (backendTok) {
          setToken(backendTok);
          await AsyncStorage.setItem(TOKEN_KEY, backendTok);
        }
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(authUser));
      }
    } catch {}
  };

  const logout = async () => {
    // Notify backend to invalidate session
    if (token) {
      try {
        const base = getApiUrl();
        if (base) {
          await fetch(`${base}/api/auth/logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {}
    }
    try { await firebaseLogout(); } catch {}
    await clearSession();
  };

  const updateProfile = async (updates: { name?: string; avatar_url?: string | null }) => {
    const backendToken = token;
    if (!backendToken) throw new Error("غير مصرح");
    const base = getApiUrl();
    if (!base) throw new Error("الخادم غير متاح");
    const { res, json } = await safeFetchJson(
      `${base}/api/auth/profile`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${backendToken}` },
        body: JSON.stringify(updates),
      },
    );
    if (!res.ok) throw new Error((json.error as string) || "فشل التحديث");
    const u = json.user as Record<string, unknown>;
    const updated: AuthUser = {
      ...(user ?? { id: 0, name: "", role: "user" }),
      id: (u.id as number) ?? user?.id ?? 0,
      name: (u.name as string) ?? user?.name ?? "",
      phone: (u.phone as string | null) ?? null,
      email: (u.email as string | null) ?? null,
      role: (u.role as AuthUser["role"]) ?? user?.role ?? "user",
      neighborhood: (u.neighborhood as string | null) ?? null,
      avatar_url: (u.avatar_url as string | null) ?? null,
      gender: (u.gender as "male" | "female" | null) ?? null,
    };
    setUser(updated);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider
      value={{
        user, token, isLoading, isGuest, canPost,
        biometricsAvailable, biometricsEnabled,
        login, loginWithGoogle, loginWithGoogleWeb, loginWithBiometrics, loginAdmin, loginModerator,
        register, setUserGender, registerAdmin,
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
