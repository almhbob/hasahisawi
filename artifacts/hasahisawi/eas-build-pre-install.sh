#!/bin/bash
# يفك تشفير الـ keystore الصحيح من EAS secret قبل البناء
# SHA1: 7B:C4:A4:FC:7A:92:37:05:D3:66:53:B1:E0:67:79:4D:6B:D4:C2:08
set -e

if [ -z "$KEYSTORE_B64" ]; then
  echo "ERROR: KEYSTORE_B64 secret is not set in EAS environment."
  exit 1
fi

echo "$KEYSTORE_B64" | base64 -d > release.keystore
echo "✅ release.keystore created successfully ($(wc -c < release.keystore) bytes)"
