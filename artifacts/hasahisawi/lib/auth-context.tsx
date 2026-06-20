import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@/lib/mobile-google";
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
  retries = 4,
  timeoutMs = 15000,
): Promise<{ res: Response; json: Record<string, unknown> }> {
  let lastError: Error = new Error("الخادم غير متاح مؤقتاً، حاول مجدداً");

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      // تصاعد تدريجي: 5s، 8s، 12s
      const delay = attempt === 1 ? 5000 : attempt === 2 ? 8000 : 12000;
      await new Promise(r => setTimeout(r, delay));
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
  otpCode?: string,
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
        otp_code: otpCode || undefined,
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