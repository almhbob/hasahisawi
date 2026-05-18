export const IMPORTANT_APP_SERVICE_LINKS = [
  {
    key: "railway",
    title: "Railway",
    description: "Backend API hosting",
    url: "https://railway.app",
  },
  {
    key: "api_health",
    title: "API Health",
    description: "Current API health endpoint",
    url: "https://workspaceapi-server-production-3e22.up.railway.app/api/healthz",
  },
  {
    key: "github_repo",
    title: "GitHub Repository",
    description: "Source code repository",
    url: "https://github.com/almhbob/hasahisawi",
  },
  {
    key: "android_builds",
    title: "Android Builds",
    description: "APK and AAB build workflow",
    url: "https://github.com/almhbob/hasahisawi/actions/workflows/build-preview-apk-v2.yml",
  },
  {
    key: "firebase",
    title: "Firebase",
    description: "Auth, notifications, Android app settings",
    url: "https://console.firebase.google.com/project/hasahisawi",
  },
  {
    key: "cloudinary",
    title: "Cloudinary",
    description: "Media and image storage",
    url: "https://console.cloudinary.com",
  },
  {
    key: "render",
    title: "Render",
    description: "Legacy backup hosting dashboard",
    url: "https://dashboard.render.com",
  },
  {
    key: "vercel",
    title: "Vercel",
    description: "Optional web deployment dashboard",
    url: "https://vercel.com/dashboard",
  },
] as const;
