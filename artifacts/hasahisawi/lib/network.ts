import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";

export type NetworkStatus = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
};

function getWebNetworkStatus(): NetworkStatus {
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  return {
    isConnected: online,
    isInternetReachable: online,
    type: "web",
  };
}

export function useNetworkStatus(): NetworkStatus & { refresh: () => void } {
  const [status, setStatus] = useState<NetworkStatus>(() => (
    Platform.OS === "web"
      ? getWebNetworkStatus()
      : { isConnected: true, isInternetReachable: null, type: "unknown" }
  ));

  const update = useCallback((state: NetInfoState) => {
    if (Platform.OS === "web") {
      setStatus(getWebNetworkStatus());
      return;
    }

    setStatus({
      isConnected: state.isConnected ?? true,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      const refreshWebStatus = () => setStatus(getWebNetworkStatus());
      refreshWebStatus();
      if (typeof window !== "undefined") {
        window.addEventListener("online", refreshWebStatus);
        window.addEventListener("offline", refreshWebStatus);
        return () => {
          window.removeEventListener("online", refreshWebStatus);
          window.removeEventListener("offline", refreshWebStatus);
        };
      }
      return undefined;
    }

    const unsubscribe = NetInfo.addEventListener(update);
    NetInfo.fetch().then(update);
    return unsubscribe;
  }, [update]);

  const refresh = useCallback(() => {
    if (Platform.OS === "web") {
      setStatus(getWebNetworkStatus());
      return;
    }
    NetInfo.fetch().then(update);
  }, [update]);

  return { ...status, refresh };
}

export async function checkConnected(): Promise<boolean> {
  if (Platform.OS === "web") {
    return typeof navigator === "undefined" ? true : navigator.onLine !== false;
  }
  const state = await NetInfo.fetch();
  return (state.isConnected ?? false) && (state.isInternetReachable !== false);
}

export async function requireNetwork(): Promise<void> {
  const ok = await checkConnected();
  if (!ok) throw new Error("لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مرة أخرى.");
}
