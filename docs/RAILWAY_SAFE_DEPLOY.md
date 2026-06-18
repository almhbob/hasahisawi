# Railway safe deployment checklist

This checklist is intentionally non-destructive. It does not require deleting services, recreating PostgreSQL, or changing volumes.

## Current safe direction

Use Railway as the primary production runtime for:

- `@workspace/api-server`
- `Postgres`
- optionally `@workspace/hasahisawi` while web deployment is being stabilized
- optionally `@workspace/admin-dashboard` after the dashboard build is green

Do not move the database unless a verified backup has been exported and restored successfully.

## Do not do these actions

- Do not delete the `Postgres` service.
- Do not delete any `postgres-volume` volume.
- Do not recreate the database service.
- Do not change `DATABASE_URL` to a new database without a tested backup and restore.
- Do not delete production environment variables.
- Do not run destructive SQL commands such as `DROP DATABASE`, `DROP SCHEMA`, or mass `DELETE` statements.

## Required Railway variables for api-server

Set these in the API service environment. Keep secret values hidden.

```txt
NODE_ENV=production
DATABASE_URL=<railway-postgres-url>
JWT_SECRET=<long-random-secret>
REQUIRE_OTP=true
ALLOW_PUBLIC_UPLOAD=false
ALLOW_ADMIN_REGISTRATION=false
DISABLE_SECURITY_HARDENING=false
HEALTH_DETAILS_TOKEN=<long-random-secret>
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<client-email>
FIREBASE_PRIVATE_KEY=<private-key>
```

## Recommended Railway commands

### API service

```txt
Root Directory: artifacts/api-server
Build Command: pnpm install --no-frozen-lockfile && pnpm run build
Start Command: pnpm run start
```

### Admin dashboard service

```txt
Root Directory: artifacts/admin-dashboard
Build Command: pnpm install --no-frozen-lockfile && pnpm run build
Output Directory: dist/public
```

### Hasahisawi web app service

```txt
Root Directory: artifacts/hasahisawi
Build Command: pnpm install --no-frozen-lockfile && pnpm run build
Output Directory: dist
```

The app build script now uses Expo web export and expects `dist/index.html` to exist after build.

## Production verification

After each deploy, check:

1. API health endpoint responds without exposing secrets.
2. Login and registration work.
3. OTP is required in production.
4. Upload requires authentication unless intentionally disabled.
5. Old community posts appear in the social section.
6. Admin dashboard loads and can reach the API.
7. PostgreSQL service remains the same original Railway database.

## Backup before major changes

Before changing database or environment wiring:

1. Open Railway Postgres.
2. Export or snapshot the database.
3. Save the backup outside Railway.
4. Confirm the API still points to the original `DATABASE_URL`.

## Rollback rule

If a deployment fails, rollback the application service only. Do not rollback or recreate the database unless the backup has been verified.
