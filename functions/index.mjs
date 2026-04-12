import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import app from "./server.mjs";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

export const api = onRequest(
  { memory: "1GiB", timeoutSeconds: 30, concurrency: 80 },
  app
);
