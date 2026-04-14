#!/bin/bash
# ==========================================================
# سكريبت الإعداد الكامل للإنتاج — حصاحيصاوي
# يُشغَّل مرة واحدة فقط على جهازك أو في Replit Shell
# ==========================================================

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   إعداد بيئة الإنتاج — حصاحيصاوي       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. فحص المتطلبات ──
echo -e "${BOLD}[1/5] فحص الأدوات المطلوبة...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js غير مثبت${NC}"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm غير مثبت${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) و npm $(npm -v) جاهزان${NC}"

# ── 2. تثبيت Firebase CLI ──
echo ""
echo -e "${BOLD}[2/5] تثبيت Firebase CLI...${NC}"

if ! command -v firebase &> /dev/null; then
  npm install -g firebase-tools
  echo -e "${GREEN}✅ تم تثبيت Firebase CLI${NC}"
else
  echo -e "${GREEN}✅ Firebase CLI موجود: $(firebase --version)${NC}"
fi

# ── 3. الحصول على Firebase CI Token ──
echo ""
echo -e "${BOLD}[3/5] تسجيل الدخول إلى Firebase...${NC}"
echo -e "${YELLOW}سيفتح المتصفح لتسجيل الدخول. بعد تسجيل الدخول، انسخ الـ token المعروض.${NC}"
echo ""

FIREBASE_TOKEN=$(firebase login:ci --no-localhost 2>/dev/null | grep -oP '(?<=token: ).*' || \
                 firebase login:ci 2>/dev/null | tail -1)

if [ -z "$FIREBASE_TOKEN" ]; then
  echo -e "${YELLOW}أدخل Firebase CI token يدوياً:${NC}"
  read -r FIREBASE_TOKEN
fi

echo -e "${GREEN}✅ تم الحصول على Firebase Token${NC}"

# ── 4. إعداد Neon Database ──
echo ""
echo -e "${BOLD}[4/5] إعداد قاعدة بيانات Neon...${NC}"
echo ""
echo -e "${YELLOW}إذا لم تكن لديك قاعدة بيانات Neon، افتح: https://neon.tech${NC}"
echo -e "${YELLOW}أنشئ مشروعاً باسم 'hasahisawi' وانسخ Connection String${NC}"
echo ""
echo -e "أدخل Neon connection string (مثال: postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require):"
read -r NEON_DATABASE_URL

if [ -z "$NEON_DATABASE_URL" ]; then
  echo -e "${YELLOW}⚠️  تم تخطي إعداد Neon — ستستخدم Firebase الـ DATABASE_URL الحالي${NC}"
  NEON_DATABASE_URL="$DATABASE_URL"
fi

# ── 5. إضافة المتغيرات إلى Firebase Secrets ──
echo ""
echo -e "${BOLD}[5/5] رفع الإعدادات إلى Firebase...${NC}"

FIREBASE_TOKEN="$FIREBASE_TOKEN" echo "$NEON_DATABASE_URL" | \
  firebase functions:secrets:set DATABASE_URL --non-interactive 2>/dev/null || \
  echo -e "${YELLOW}⚠️  سيتم إعداد DATABASE_URL يدوياً${NC}"

echo ""
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ الإعداد مكتمل!${NC}"
echo ""
echo -e "${BOLD}الخطوات التالية:${NC}"
echo ""
echo -e "1. أضف هذه الـ Secrets في GitHub → Settings → Secrets:"
echo -e "   ${BOLD}FIREBASE_TOKEN${NC} = ${FIREBASE_TOKEN:0:20}..."
echo -e "   ${BOLD}NEON_DATABASE_URL${NC} = (string الـ Neon)"
echo -e "   ${BOLD}EXPO_TOKEN${NC} = (من expo.dev → Account → Access Tokens)"
echo ""
echo -e "2. ادفع الكود إلى GitHub:"
echo -e "   ${BOLD}git push origin main${NC}"
echo ""
echo -e "3. GitHub Actions ستنشر Firebase Functions تلقائياً!"
echo -e "   URL: ${GREEN}https://hasahisawi.web.app/api/health${NC}"
echo -e "${BOLD}═══════════════════════════════════════${NC}"

# حفظ الـ Token في ملف مؤقت
echo "FIREBASE_TOKEN=$FIREBASE_TOKEN" > .env.production.local
echo "NEON_DATABASE_URL=$NEON_DATABASE_URL" >> .env.production.local
echo ""
echo -e "${YELLOW}⚠️  الـ tokens محفوظة في .env.production.local — لا ترفعها إلى GitHub!${NC}"
