import { useEffect } from "react";
import { initOfflineQueueSync } from "@/lib/offline-queue";

export default function OfflineQueueSync() {
  useEffect(() => {
    initOfflineQueueSync();
  }, []);

  return null;
}
