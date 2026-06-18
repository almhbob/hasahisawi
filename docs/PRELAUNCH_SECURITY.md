# Prelaunch Security Checklist — Hasahisawi

This document tracks the security work required before public production release.

## Applied in this branch

- Added `security-hardening.ts` as a central guard before legacy routes.
- Registered the hardening router before upload and monolithic routes.
- Blocked production `x-admin-pin` / `admin_pin` / `current_pin` based authorization.
- Disabled public admin self-registration unless `ALLOW_ADMIN_REGISTRATION=true`.
- Blocked admin login with the fallback PIN, including the old `4444` value.
- Required OTP for registration in production unless `REQUIRE_OTP=false` is explicitly configured.
- Required authenticated users for `/api/upload` unless `ALLOW_PUBLIC_UPLOAD=true`.
- Required a real admin session for upload delete and PIN management routes.
- Rejected unverified Firebase JWT fallback for `/api/auth/me/complete-profile`.
- Tightened upload MIME validation and size limits.
- Hid detailed readiness checks from public `/api/readyz` and `/api/healthz/full` unless `HEALTH_DETAILS_TOKEN` is supplied.
- Added `scripts/check-prelaunch-security.mjs` and wired it into `prelaunch:check` and `build`.
- Updated `scripts/prepare-mobile-store-release.mjs` so it no longer forces OTP bypass and uses the current production API/version defaults.

## Must finish before release

These files still contain release-time insecure values and the security check intentionally fails until they are fixed:

1. `artifacts/hasahisawi/eas.json`
   - Replace every `EXPO_PUBLIC_DISABLE_OTP=true` with `false`.
   - Prefer moving Firebase public configuration to EAS environment/secrets instead of hardcoding in the file.

2. `.github/workflows/release-v6.yml`
   - Remove all `EXPO_PUBLIC_DISABLE_OTP=true` and `EXPO_PUBLIC_DISABLE_OTP: 'true'` lines.
   - Remove hardcoded signing fallback passwords.
   - Fail the workflow if keystore secrets are not configured.
   - Change Google Play default release track to internal/closed testing until final approval.

3. `artifacts/api-server/src/routes/hasahisawi.ts`
   - Remove the legacy `DEFAULT_ADMIN_PIN ?? "4444"` fallback from the monolithic route file.
   - Remove the old PIN fallback paths once the new admin session workflow is confirmed in production.

4. `package.json`
   - One pnpm override key was accidentally typoed during script wiring and should be corrected from `@tailwindcss/oxide>@tailwindcss-oxide-darwin-x64` to `@tailwindcss/oxide>@tailwindcss/oxide-darwin-x64`.

## Production environment values

Recommended production values:

```bash
NODE_ENV=production
DISABLE_SECURITY_HARDENING=false
ALLOW_ADMIN_REGISTRATION=false
ALLOW_PUBLIC_UPLOAD=false
REQUIRE_OTP=true
DEFAULT_ADMIN_PIN=
HEALTH_DETAILS_TOKEN=<long-random-token>
```

Use GitHub/EAS/hosting secrets for all service credentials. Do not commit real service-account JSON, keystores, or signing passwords.
