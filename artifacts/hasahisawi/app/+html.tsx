import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0D0D0D" />

        {/* iOS PWA — تجعل التطبيق يعمل كتطبيق أصلي على iPhone */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="حصاحيصاوي" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/assets/assets/images/icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/assets/assets/images/icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/assets/assets/images/icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/assets/assets/images/icon.png" />

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
          html { height: 100%; margin: 0; padding: 0; }

          body {
            margin: 0; padding: 0;
            background-color: #07110A;
            min-height: 100%;
            display: flex;
            justify-content: center;
            align-items: stretch;
          }

          /* ── Mobile & tablet browsers: full screen ── */
          #root {
            display: flex;
            flex-direction: column;
            width: 100vw;
            max-width: 100vw;
            min-height: 100dvh;
            overflow: hidden;
          }

          /* ── Desktop only: phone frame centered ── */
          @media (min-width: 900px) {
            body {
              overflow: hidden;
              height: 100vh;
              align-items: center;
              background:
                radial-gradient(ellipse 60% 50% at 20% 30%, rgba(20,80,30,0.20) 0%, transparent 60%),
                radial-gradient(ellipse 50% 40% at 80% 70%, rgba(34,197,94,0.10) 0%, transparent 60%),
                linear-gradient(160deg, #07110A 0%, #0A1A0E 50%, #070D08 100%);
            }

            #root {
              width: 430px;
              max-width: 430px;
              min-width: 320px;
              height: 100vh;
              max-height: 100vh;
              border-radius: 0;
              box-shadow:
                0 0 0 1px rgba(34,197,94,0.15),
                0 25px 80px rgba(0,0,0,0.7),
                0 0 120px rgba(15,80,30,0.1);
              overflow: hidden;
              position: relative;
            }
          }

          /* ── Large desktop: decorative side panels ── */
          @media (min-width: 1100px) {
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 48px;
            }
            body::before {
              content: 'حصاحيصاوي\A بوابتك الذكيّة\A لمدينة الحصاحيصا';
              white-space: pre;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              width: 260px;
              font-size: 22px;
              font-weight: 700;
              line-height: 1.7;
              direction: rtl;
              background: linear-gradient(135deg, #22C55E, #EAB308);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              opacity: 0.9;
            }
            body::after {
              content: 'الحصاحيصا\A السودان';
              white-space: pre;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              width: 260px;
              font-size: 18px;
              line-height: 2;
              direction: rtl;
              color: rgba(34,197,94,0.4);
              font-weight: 600;
            }
            #root {
              width: 430px;
              max-width: 430px;
              min-width: 320px;
              height: 100vh;
              max-height: 100vh;
              border-radius: 0;
              box-shadow:
                0 0 0 1px rgba(34,197,94,0.2),
                0 25px 80px rgba(0,0,0,0.7),
                0 0 60px rgba(34,197,94,0.08);
              overflow: hidden;
              position: relative;
            }
          }

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
