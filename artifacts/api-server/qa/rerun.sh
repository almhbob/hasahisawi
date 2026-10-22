cd /vercel/hasahisawi && git fetch -q origin feat/lawyers-forms-offline-women && git reset -q --hard FETCH_HEAD
cd artifacts/api-server && node build.mjs > /tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }
for p in $(ss -ltnp | grep -E ':5432|:8080' | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill $p; done; sleep 1
cd /tmp/pg && nohup node pgserver.mjs > /tmp/pg.log 2>&1 &
sleep 3
cd /vercel/hasahisawi/artifacts/api-server && DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres PORT=8080 NODE_ENV=development nohup node dist/index.mjs > /tmp/api.log 2>&1 &
for i in $(seq 1 60); do curl -sf localhost:8080/api/healthz >/dev/null && break; sleep 1; done
sleep 12
cp /vercel/hasahisawi/artifacts/api-server/qa/e2e-requests.mjs /tmp/pg/e2e.mjs && cd /tmp/pg && node e2e.mjs > /tmp/e2e.log 2>&1
cd /vercel/hasahisawi/artifacts/hasahisawi && npx tsc --noEmit -p tsconfig.json > /tmp/tsc-app.log 2>&1; echo TSC_EXIT $? >> /tmp/tsc-app.log
cd ../api-server && npx tsc --noEmit -p tsconfig.json > /tmp/tsc-api.log 2>&1; echo TSC_EXIT $? >> /tmp/tsc-api.log
echo ALLDONE > /tmp/done
