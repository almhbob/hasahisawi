import React, { createContext, useContext, useEffect, useState } from "react";
import { fetch } from "expo/fetch";
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
  sections: Record<string, SectionConfig>;
};

const DEFAULT_FLAGS: FeatureFlags = {
  gov_services_enabled: true,
  gov_appointments_enabled: true,
  gov_reports_enabled: true,
  ride_status: "soon",
  sections: {},
};

const FeatureFlagsContext = createContext<FeatureFlags>(DEFAULT_FLAGS);

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    const baseUrl = getApiUrl();
    if (!baseUrl) return;

    // تحميل علامات الميزات والأقسام معاً
    Promise.all([
      fetch(`${baseUrl}/api/app/feature-flags`, { credentials: "include" })
        .then(r => r.json()).catch(() => ({})),
      fetch(`${baseUrl}/api/app/section-configs`, { credentials: "include" })
        .then(r => r.json()).catch(() => ({})),
    ]).then(([flagsData, sectionsData]) => {
      setFlags(prev => ({
        ...prev,
        ...(flagsData && typeof flagsData === "object" ? {
          gov_services_enabled:     flagsData.gov_services_enabled     ?? prev.gov_services_enabled,
          gov_appointments_enabled: flagsData.gov_appointments_enabled ?? prev.gov_appointments_enabled,
          gov_reports_enabled:      flagsData.gov_reports_enabled      ?? prev.gov_reports_enabled,
          ride_status:              flagsData.ride_status               ?? prev.ride_status,
        } : {}),
        sections: sectionsData && typeof sectionsData === "object" ? sectionsData : prev.sections,
      }));
    });
  }, []);

  return (
    <FeatureFlagsContext.Provider value={flags}>
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
