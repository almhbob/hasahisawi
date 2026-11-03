import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { fetch } from "@/lib/net-fetch";
import { getApiUrl } from "@/lib/query-client";

export type RideStatus = "soon" | "maintenance" | "available";
export type ContractStatus = "none" | "pending" | "signed" | "expired";

export type SectionConfig = {
  visible: boolean;
  contract_status: ContractStatus;
};

export type FeatureFlags = {
  gov_services_enabled: boolean;
  gov_appointments_enabled: boolean;
  gov_reports_enabled: boolean;
  ride_status: RideStatus;
  /** عرض الباقات والأسعار والاشتراكات لمقدّمي الخدمات (تتحكم بها الإدارة) */
  pricing_visible: boolean;
  sections: Record<string, SectionConfig>;
  /** إعادة التحميل فوراً (بعد تعديل الإدارة) */
  refresh?: () => void;
};

const DEFAULT_FLAGS: FeatureFlags = {
  gov_services_enabled: true,
  gov_appointments_enabled: true,
  gov_reports_enabled: true,
  ride_status: "soon",
  pricing_visible: false,
  sections: {},
};

const FeatureFlagsContext = createContext<FeatureFlags>(DEFAULT_FLAGS);

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  const load = useCallback(() => {
    const baseUrl = getApiUrl();
    if (!baseUrl) return;
    // cache: "no-store" حتى لا تُعرض حالة قديمة بعد أن تغيّرها الإدارة
    Promise.all([
      fetch(`${baseUrl}/api/app/feature-flags`, { credentials: "include", cache: "no-store" } as any)
        .then(r => r.json()).catch(() => ({})),
      fetch(`${baseUrl}/api/app/section-configs`, { credentials: "include", cache: "no-store" } as any)
        .then(r => r.json()).catch(() => ({})),
    ]).then(([flagsData, sectionsData]) => {
      setFlags(prev => ({
        ...prev,
        ...(flagsData && typeof flagsData === "object" ? {
          gov_services_enabled:     flagsData.gov_services_enabled     ?? prev.gov_services_enabled,
          gov_appointments_enabled: flagsData.gov_appointments_enabled ?? prev.gov_appointments_enabled,
          gov_reports_enabled:      flagsData.gov_reports_enabled      ?? prev.gov_reports_enabled,
          ride_status:              flagsData.ride_status               ?? prev.ride_status,
          pricing_visible:          flagsData.pricing_visible === true,
        } : {}),
        sections: sectionsData && typeof sectionsData === "object" ? sectionsData : prev.sections,
      }));
    });
  }, []);

  useEffect(() => {
    load();
    // تحديث عند العودة للتطبيق وكل 3 دقائق — كانت تُحمَّل مرة واحدة فقط عند فتح التطبيق
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") load(); });
    const t = setInterval(load, 3 * 60_000);
    return () => { sub.remove(); clearInterval(t); };
  }, [load]);

  return (
    <FeatureFlagsContext.Provider value={{ ...flags, refresh: load }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext);
}

// مساعد: هل القسم مرئي؟
export function useSectionVisible(key: string, defaultValue = true): boolean {
  const { sections } = useFeatureFlags();
  return sections[key]?.visible ?? defaultValue;
}

// مساعد: حالة العقد لقسم معين
export function useSectionContractStatus(key: string): ContractStatus {
  const { sections } = useFeatureFlags();
  return sections[key]?.contract_status ?? "none";
}

// مساعد: هل تُعرض الباقات والاشتراكات؟ (مخفية افتراضياً)
export function usePricingVisible(): boolean {
  return useFeatureFlags().pricing_visible;
}
