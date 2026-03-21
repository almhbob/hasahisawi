import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useState, useEffect, useCallback } from "react";

export type NetworkStatus = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
};

export function useNetworkStatus(): NetworkStatus & { refresh: () => void } {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
    type: "unknown",
  });

  const update = useCallback((state: NetInfoState) => {
    setStatus({
      isConnected: state.isConnected ?? true,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    });
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(update);
    NetInfo.fetch().then(update);
    return unsubscribe;
  }, [update]);

  const refresh = useCallback(() => {
    NetInfo.fetch().then(update);
  }, [update]);

  return { ...status, refresh };
}

export async function checkConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return (state.isConnected ?? false) && (state.isInternetReachable !== false);
}

export async function requireNetwork(): Promise<void> {
  const ok = await checkConnected();
  if (!ok) throw new Error("لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مرة أخرى.");
}
