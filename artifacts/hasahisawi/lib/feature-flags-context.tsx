import React, { createContext, useContext, useEffect, useState } from "react";
import { fetch } from "expo/fetch";
import { getApiUrl } from "@/lib/query-client";

export type RideStatus = "soon" | "maintenance" | "available";

export type FeatureFlags = {
  gov_services_enabled: boolean;
  gov_appointments_enabled: boolean;
  gov_reports_enabled: boolean;
  ride_status: RideStatus;
};

const DEFAULT_FLAGS: FeatureFlags = {
  gov_services_enabled: true,
  gov_appointments_enabled: true,
  gov_reports_enabled: true,
  ride_status: "soon",
};

const FeatureFlagsContext = createContext<FeatureFlags>(DEFAULT_FLAGS);

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    const baseUrl = getApiUrl();
    if (!baseUrl) return;
    fetch(`${baseUrl}/api/app/feature-flags`, { credentials: "include" })
      .then(r => r.json())
      .then((data: FeatureFlags) => {
        if (data && typeof data === "object") setFlags(data);
      })
      .catch(() => {});
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
