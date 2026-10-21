// node-postgres gives SSL settings parsed from the connection string (sslmode=…, ssl=…)
// precedence over the explicit `ssl` option passed to Pool/Client. With
// `?sslmode=require` in DATABASE_URL, pg therefore verifies the server certificate
// (it treats `require` as `verify-full`) and ignores `{ rejectUnauthorized: false }`,
// which is why production had to disable TLS verification process-wide with
// NODE_TLS_REJECT_UNAUTHORIZED=0. Stripping the SSL params lets each pool's explicit
// `ssl` option apply, so that global override is no longer needed for the database.
const SSL_PARAMS = ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"];

export function stripSslParams(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    let changed = false;
    for (const k of SSL_PARAMS) {
      if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; }
    }
    return changed ? u.toString() : url;
  } catch {
    return url;
  }
}
