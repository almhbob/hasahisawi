# Railway Production Recovery Checklist

## Current blocker

Do not release the mobile app while the Railway PostgreSQL service is crashed.

Required healthy state:

- api-server is Online.
- PostgreSQL is Online.
- `/api/healthz` returns JSON.
- `/api/readyz` confirms database and Firebase readiness.

## Recover PostgreSQL

Open the Railway project, select the red Postgres service, then open Logs.

Try this first:

1. Open Postgres.
2. Click Restart or Redeploy.
3. Wait 1-2 minutes.
4. Confirm status changes to Online.

If it stays crashed and there is no production data to preserve:

1. Delete the broken Postgres service.
2. Click Add.
3. Choose Database.
4. Choose PostgreSQL.
5. Wait until it is Online.

## Link DATABASE_URL to api-server

Open api-server then Variables.

Required variable names:

```text
NODE_ENV
DATABASE_URL
FIREBASE_SERVICE_ACCOUNT_JSON
ALLOWED_ORIGINS
```

Set NODE_ENV to production.
Set DATABASE_URL using Railway Add Reference from the PostgreSQL service.
Set FIREBASE_SERVICE_ACCOUNT_JSON by pasting the Firebase Admin JSON directly inside Railway only.
Set ALLOWED_ORIGINS to star for the first production smoke test.

## Redeploy api-server

After PostgreSQL is Online and variables are present:

1. Open api-server.
2. Open Deployments.
3. Click Redeploy.

## Test production API

Open the public api-server domain and test:

```text
https://YOUR_API_DOMAIN/api/healthz
https://YOUR_API_DOMAIN/api/readyz
```

Only build the store release after readyz is healthy.

## Build store release after Railway is healthy

```bash
STORE_API_HOST=YOUR_API_DOMAIN node scripts/prepare-mobile-store-release.mjs
pnpm run prelaunch:check
cd artifacts/hasahisawi
pnpm run release:android:aab
```
