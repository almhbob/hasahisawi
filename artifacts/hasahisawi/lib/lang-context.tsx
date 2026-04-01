import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nManager, Platform } from "react-native";
import { reloadAppAsync } from "expo";
import { getLocales } from "expo-localization";
import { translations, Lang } from "./translations";

const LANG_KEY = "app_language";

interface LangContextType {
  lang: Lang;
  isRTL: boolean;
  setLanguage: (lang: Lang) => Promise<void>;
  t: (section: keyof typeof translations.ar, key?: string) => any;
  tr: (ar: string, en: string) => string;
}

const LangContext = createContext<LangContextType>({
  lang: "ar",
  isRTL: true,
  setLanguage: async () => {},
  t: () => "",
  tr: (ar) => ar,
});

export function LangProvider({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const isRTL = lang === "ar";

  const setLanguage = async (newLang: Lang) => {
    await AsyncStorage.setItem(LANG_KEY, newLang);
    const shouldBeRTL = newLang === "ar";
    if (Platform.OS !== "web") {
      I18nManager.forceRTL(shouldBeRTL);
    }
    await reloadAppAsync();
  };

  const t = (section: keyof typeof translations.ar, key?: string): any => {
    const sectionData = (translations[lang] as any)[section];
    if (!key) return sectionData;
    return sectionData?.[key] ?? (translations.ar as any)[section]?.[key] ?? key;
  };

  const tr = (ar: string, en: string): string => {
    return lang === "ar" ? ar : en;
  };

  return (
    <LangContext.Provider value={{ lang, isRTL, setLanguage, t, tr }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

// ── كشف لغة النظام تلقائياً ────────────────────────────────────
function detectSystemLang(): Lang {
  try {
    const locales = getLocales();
    const primary = locales[0];
    if (!primary) return "ar";
    const code = primary.languageCode?.toLowerCase() ?? "";
    if (code === "ar") return "ar";
    if (code === "en") return "en";
    // fallback: use ar for all other languages (المدينة عربية بالأساس)
    return "ar";
  } catch {
    return "ar";
  }
}

export async function getStoredLang(): Promise<Lang> {
  try {
    const stored = await AsyncStorage.getItem(LANG_KEY);
    // إذا اختار المستخدم لغةً صراحةً → استخدمها
    if (stored === "en" || stored === "ar") return stored;
  } catch {}
  // وإلا → اكتشف لغة الجهاز تلقائياً
  return detectSystemLang();
}
