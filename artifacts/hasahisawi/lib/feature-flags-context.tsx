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
  gov_services_enabled: false,
  gov_appointments_enabled: false,
  gov_reports_enabled: false,
  ride_status: "available",
};

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalizeRideStatus(value: unknown): RideStatus {
  const raw = String(value ?? "").trim();
  if (raw === "available") return "available";
  if (raw === "maintenance") return "maintenance";
  if (raw === "coming_soon" || raw === "soon") return "soon";
  return "available";
}

const FeatureFlagsContext = createContext<FeatureFlags>(DEFAULT_FLAGS);

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    const baseUrl = getApiUrl();
    if (!baseUrl) return;

    const load = async () => {
      try {
        const [featureRes, transportRes] = await Promise.allSettled([
          fetch(`${baseUrl}/api/app/feature-flags`, { credentials: "include" }),
          fetch(`${baseUrl}/api/transport/settings`, { credentials: "include" }),
        ]);

        let next: FeatureFlags = { ...DEFAULT_FLAGS };

        if (featureRes.status === "fulfilled" && featureRes.value.ok) {
          const data = await featureRes.value.json().catch(() => null);
          if (data && typeof data === "object") {
            const record = data as Record<string, unknown>;
            next = {
              gov_services_enabled: asBool(record.gov_services_enabled, DEFAULT_FLAGS.gov_services_enabled),
              gov_appointments_enabled: asBool(record.gov_appointments_enabled, DEFAULT_FLAGS.gov_appointments_enabled),
              gov_reports_enabled: asBool(record.gov_reports_enabled, DEFAULT_FLAGS.gov_reports_enabled),
              ride_status: normalizeRideStatus(record.ride_status),
            };
          }
        }

        if (transportRes.status === "fulfilled" && transportRes.value.ok) {
          const data = await transportRes.value.json().catch(() => null);
          if (data && typeof data === "object") {
            const record = data as Record<string, unknown>;
            next.ride_status = normalizeRideStatus(record.transport_status ?? record.ride_status);
          }
        }

        setFlags(next);
      } catch {
        setFlags(DEFAULT_FLAGS);
      }
    };

    load();
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
