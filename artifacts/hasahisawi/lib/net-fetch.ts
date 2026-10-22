// expo/fetch wrapped with the offline read cache (see lib/offline-cache.ts).
import { fetch as expoFetch } from "expo/fetch";
import { withOfflineCache } from "@/lib/offline-http-cache";

export const fetch = withOfflineCache(expoFetch as any) as typeof expoFetch;
