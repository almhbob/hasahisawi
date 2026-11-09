import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    // الاتجاه LTR عن قصد: كل الشاشات مصممة لليمين بـ row-reverse و textAlign:"right"
    // (كما في الهاتف حيث RTL معطّل). dir="rtl" كان يعكس الواجهة على الويب مرة ثانية
    // فتظهر الرئيسية يساراً والعناوين يساراً. النصوص نفسها تأخذ اتجاهها تلقائياً (dir=auto).
    <html lang="ar" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        {/* PWA */}
        <meta name="application-name" content="حصاحيصاوي" />
        <meta name="description" content="بوابتك المجتمعية لمدينة الحصاحيصا وقراها" />

        {/* معاينة الروابط في فيسبوك وواتساب وتيليجرام وX — بدونها تظهر الروابط بمربع رمادي */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="حصاحيصاوي" />
        <meta property="og:locale" content="ar_AR" />
        <meta property="og:title" content="حصاحيصاوي — لخدمة مواطن المنطقة وضواحيها" />
        <meta property="og:description" content="خدمات الحصاحيصا وضواحيها في تطبيق واحد: مشاوير، متاجر، صحة، وظائف وأكثر من 30 خدمة. حمّل التطبيق مجاناً." />
        <meta property="og:url" content="https://hasahisawi.pages.dev/" />
        <meta property="og:image" content="https://hasahisawi.pages.dev/og/hasahisawi.png" />
        <meta property="og:image:secure_url" content="https://hasahisawi.pages.dev/og/hasahisawi.png" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="حصاحيصاوي — خدمات المنطقة في تطبيق واحد" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="حصاحيصاوي — لخدمة مواطن المنطقة وضواحيها" />
        <meta name="twitter:description" content="خدمات الحصاحيصا وضواحيها في تطبيق واحد. حمّل التطبيق مجاناً." />
        <meta name="twitter:image" content="https://hasahisawi.pages.dev/og/hasahisawi.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0B6B49" />

        {/* iOS PWA — تجعل التطبيق يعمل كتطبيق أصلي على iPhone */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="حصاحيصاوي" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />

        {/* Apple Touch Icons */}
        {/* شعار حصاحيصاوي (كانت أيقونة «ح» القديمة) */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/hasahisawi-192.png" />

        {/* Apple Splash Screens — شاشة البداية لكل موديل iPhone */}
        <link rel="apple-touch-startup-image" media="screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)" href="/splash/splash-1320x2868.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)" href="/splash/splash-1206x2622.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" href="/splash/splash-1290x2796.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" href="/splash/splash-1170x2532.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" href="/splash/splash-750x1334.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" href="/splash/splash-2048x2732.png" />

        {/* Service Worker registration for offline support */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}} />

        <ScrollViewStyleReset />

        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          /* مفاتيح التشغيل (Switch): في اتجاه RTL ينقلب موضع المقبض فيخرج عن المسار */
          div:has(> input[role="switch"]) { direction: ltr; }
          html { height: 100%; margin: 0; padding: 0; }

          body {
            margin: 0; padding: 0;
            /* خلفية ما قبل تحميل الواجهة: فاتحة كشاشة البدء (كانت شبه سوداء) */
            background-color: #FFFFFF;
            min-height: 100%;
            display: flex;
            justify-content: center;
            align-items: stretch;
          }

          /* التطبيق يملأ الشاشة على كل الأجهزة. على الكمبيوتر يعرض DesktopShell تخطيط موقع
             (شريط جانبي + عمود محتوى + لوحة وصول سريع) بدل إطار هاتف ضيق في المنتصف. */
          #root {
            display: flex;
            flex-direction: column;
            width: 100vw;
            max-width: 100vw;
            min-height: 100dvh;
            overflow: hidden;
          }
          @media (min-width: 1024px) {
            body { height: 100vh; overflow: hidden; background-color: #E8EFEB; }
            #root { height: 100vh; }
          }

          @media (prefers-color-scheme: dark) { body { background-color: #0B1410; } }

          ::-webkit-scrollbar { width: 4px; height: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(34,197,94,0.25); border-radius: 2px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(34,197,94,0.45); }
          ::selection { background: rgba(34,197,94,0.3); color: inherit; }

          @supports (padding-top: env(safe-area-inset-top)) {
            @media (max-width: 899px) {
              body {
                padding-top: env(safe-area-inset-top);
                padding-bottom: env(safe-area-inset-bottom);
                padding-left: env(safe-area-inset-left);
                padding-right: env(safe-area-inset-right);
              }
            }
          }

          body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
          * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
