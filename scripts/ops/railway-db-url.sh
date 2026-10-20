#!/usr/bin/env bash
# Print the PUBLIC postgres URL of a Railway Postgres service.
# Usage: railway-db-url.sh <projectId> <environmentId> <serviceId> [sslmode]
# Requires RAILWAY_TOKEN. The URL contains a password: callers must ::add-mask:: it.
set -euo pipefail
P="$1"; E="$2"; S="$3"; SSL="${4:-require}"
Q=$(printf '{"query":"query { variables(projectId: \\"%s\\", environmentId: \\"%s\\", serviceId: \\"%s\\") }"}' "$P" "$E" "$S")
RAW=$(curl -sS -X POST https://backboard.railway.com/graphql/v2 -H "Content-Type: application/json" -H "Authorization: Bearer $RAILWAY_TOKEN" -d "$Q")
printf '%s' "$RAW" | grep -q '"variables"' || RAW=$(curl -sS -X POST https://backboard.railway.com/graphql/v2 -H "Content-Type: application/json" -H "Project-Access-Token: $RAILWAY_TOKEN" -d "$Q")
SSL="$SSL" python3 -c '
import json, os, sys, urllib.parse as u
v = ((json.load(sys.stdin).get("data") or {}).get("variables") or {})
host, port = v.get("RAILWAY_TCP_PROXY_DOMAIN"), v.get("RAILWAY_TCP_PROXY_PORT")
pw = v.get("POSTGRES_PASSWORD") or v.get("PGPASSWORD")
if not (host and port and pw):
    sys.exit("missing proxy host/port/password")
user = v.get("POSTGRES_USER") or v.get("PGUSER") or "postgres"
db = v.get("POSTGRES_DB") or v.get("PGDATABASE") or "railway"
print("postgresql://%s:%s@%s:%s/%s?sslmode=%s" % (u.quote(user, safe=""), u.quote(pw, safe=""), host, port, db, os.environ["SSL"]))
' <<< "$RAW"
