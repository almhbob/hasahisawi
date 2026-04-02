#!/bin/bash
# Auto-publish AAB to GitHub Release when EAS build completes

BUILD_ID="93373dc8-c313-40b2-ae4d-593569dc6e85"
EXPO_TOKEN="bZISEhd5o5vTwttTatwVCSU9WbrXyRc76lpG5zOx"
GITHUB_TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN"
REPO="almhbob/hasahisawi"
VERSION="2.2.2"
TAG="v${VERSION}"

echo "⏳ Waiting for EAS build to complete..."
echo "Build ID: $BUILD_ID"
echo ""

while true; do
  STATUS=$(cd /home/runner/workspace/artifacts/hasahisawi && EXPO_TOKEN="$EXPO_TOKEN" eas build:view "$BUILD_ID" 2>&1)
  BUILD_STATUS=$(echo "$STATUS" | grep "Status:" | awk '{print $2}')
  DOWNLOAD_URL=$(echo "$STATUS" | grep "Application Archive URL:" | awk '{print $4}')
  
  echo "$(date '+%H:%M:%S') — Status: $BUILD_STATUS"
  
  if [ "$BUILD_STATUS" = "finished" ] && [ -n "$DOWNLOAD_URL" ] && [ "$DOWNLOAD_URL" != "<in" ]; then
    echo ""
    echo "✅ Build complete! Download URL: $DOWNLOAD_URL"
    
    # Download the AAB
    echo "📥 Downloading AAB..."
    curl -L -o "/tmp/hasahisawi-v${VERSION}.aab" "$DOWNLOAD_URL"
    
    echo "📦 Creating GitHub Release..."
    
    # Create GitHub release
    RELEASE_RESPONSE=$(curl -s -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Content-Type: application/json" \
      "https://api.github.com/repos/$REPO/releases" \
      -d "{
        \"tag_name\": \"$TAG\",
        \"target_commitish\": \"main\",
        \"name\": \"حصاحيصاوي v${VERSION}\",
        \"body\": \"## الإصدار ${VERSION}\n\n### التحديثات:\n- نظام مراقبة المحتوى بالذكاء الاصطناعي\n- البحث الشامل للمستخدمين والمنشورات\n- الملف الشخصي مع إحصائيات\n- استعادة كلمة المرور\n- تحسينات الأداء والاستقرار\n\n### ملفات الإصدار:\n- \`hasahisawi-v${VERSION}.aab\` — Android App Bundle (للرفع على Google Play)\",
        \"draft\": false,
        \"prerelease\": false
      }")
    
    UPLOAD_URL=$(echo "$RELEASE_RESPONSE" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { const j=JSON.parse(d); console.log(j.upload_url?.replace('{?name,label}','')); } catch(e){console.log('ERROR');} })")
    RELEASE_URL=$(echo "$RELEASE_RESPONSE" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { const j=JSON.parse(d); console.log(j.html_url); } catch(e){console.log('ERROR');} })")
    
    echo "⬆️ Uploading AAB to GitHub Release..."
    curl -s -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary @"/tmp/hasahisawi-v${VERSION}.aab" \
      "${UPLOAD_URL}?name=hasahisawi-v${VERSION}.aab"
    
    echo ""
    echo "🎉 DONE! GitHub Release published:"
    echo "   $RELEASE_URL"
    echo ""
    echo "📥 Direct AAB Download:"
    echo "   https://github.com/$REPO/releases/download/$TAG/hasahisawi-v${VERSION}.aab"
    break
    
  elif [ "$BUILD_STATUS" = "errored" ]; then
    echo "❌ Build failed!"
    echo "$STATUS"
    break
  fi
  
  sleep 60
done
