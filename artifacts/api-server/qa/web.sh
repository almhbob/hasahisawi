set -e
cd /vercel/hasahisawi/artifacts/hasahisawi
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080 npx expo export -p web --output-dir /tmp/web > /tmp/web-export.log 2>&1
for p in $(ss -ltnp | grep -E ':3000' | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill $p; done
cd /tmp && (npx -y serve@14 -s /tmp/web -l 3000 > /tmp/serve.log 2>&1 &)
mkdir -p /tmp/pw /tmp/shots && cd /tmp/pw && [ -d node_modules/playwright ] || (npm init -y >/dev/null && npm i playwright@1.48.2 >/dev/null 2>&1 && sudo npx playwright install --with-deps chromium > /tmp/pwi.log 2>&1)
sleep 3
cp /vercel/hasahisawi/artifacts/api-server/qa/web-shots.mjs /tmp/pw/ && cd /tmp/pw && node web-shots.mjs > /tmp/shots.log 2>&1
echo WEBDONE > /tmp/webdone
