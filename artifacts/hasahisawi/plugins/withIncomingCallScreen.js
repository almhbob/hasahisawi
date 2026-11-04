const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
  withMainApplication,
  withProjectBuildGradle,
  AndroidConfig,
} = require("@expo/config-plugins");

/**
 * Plugin: withIncomingCallScreen
 *
 * Full-screen incoming voice call on Android (WhatsApp-like), used by lib/incoming-call.android.ts.
 * The committed android/ project already contains every change below; this plugin reproduces them
 * if android/ is ever regenerated with `expo prebuild` (e.g. `pnpm apk:prepare`).
 *
 * 1. AndroidManifest: USE_FULL_SCREEN_INTENT; drop FOREGROUND_SERVICE / SCHEDULE_EXACT_ALARM and
 *    Notifee's ForegroundService (added by @notifee/react-native, unused here).
 * 2. CallScreenModule.kt (native module HasahisawiCallScreen + CallWindow helper).
 * 3. MainActivity: show over the lock screen when launched by the call's full-screen intent.
 * 4. MainApplication: register CallScreenPackage.
 * 5. android/build.gradle: Notifee's local Maven repo (app.notifee:core) resolved through node.
 */
const MARK = "@hasahisawi-call-screen";

function withManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$["xmlns:tools"] = manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
    const perms = (manifest["uses-permission"] = manifest["uses-permission"] || []);
    const upsert = (name, attrs = {}) => {
      const existing = perms.find((p) => p.$?.["android:name"] === name);
      if (existing) Object.assign(existing.$, attrs);
      else perms.push({ $: { "android:name": name, ...attrs } });
    };
    upsert("android.permission.USE_FULL_SCREEN_INTENT");
    upsert("android.permission.FOREGROUND_SERVICE", { "tools:node": "remove" });
    upsert("android.permission.SCHEDULE_EXACT_ALARM", { "tools:node": "remove" });

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service || [];
    if (!app.service.some((s) => s.$?.["android:name"] === "app.notifee.core.ForegroundService")) {
      app.service.push({ $: { "android:name": "app.notifee.core.ForegroundService", "tools:node": "remove" } });
    }
    return cfg;
  });
}

function withNativeModuleFile(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) throw new Error("withIncomingCallScreen: expo.android.package is required");
      const tmpl = fs.readFileSync(path.join(__dirname, "native", "CallScreenModule.kt.tmpl"), "utf8");
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "java", ...pkg.split("."));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "CallScreenModule.kt"), tmpl.replace("{{PACKAGE}}", pkg));
      return cfg;
    },
  ]);
}

function withActivity(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== "kt" || src.includes(MARK)) return cfg;
    if (!src.includes("import android.content.Intent")) {
      src = src.replace(/(import android\.os\.Bundle\n)/, "import android.content.Intent\n$1");
    }
    src = src.replace(
      /(super\.onCreate\((?:null|savedInstanceState)\)\n)(\s*)\}/,
      `$1$2  // ${MARK}: مكالمة واردة بملء الشاشة → فوق قفل الشاشة مع إضاءتها\n$2  CallWindow.onActivityIntent(this, intent)\n$2}\n\n` +
        `$2override fun onNewIntent(intent: Intent) {\n$2  super.onNewIntent(intent)\n$2  CallWindow.onActivityIntent(this, intent)\n$2}`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withApplication(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== "kt" || src.includes(MARK)) return cfg;
    src = src.replace(
      /(PackageList\(this\)\.packages\.apply \{\n)/,
      `$1              add(CallScreenPackage()) // ${MARK}\n`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withNotifeeRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== "groovy" || src.includes(MARK)) return cfg;
    const block =
      `// ${MARK}: local Maven repo holding app.notifee:core\n` +
      `def notifeeLibsDir = null\n` +
      `try {\n` +
      `  def notifeePkg = ["node", "--print", "require.resolve('@notifee/react-native/package.json')"].execute(null, rootDir).text.trim()\n` +
      `  if (notifeePkg) notifeeLibsDir = new File(new File(notifeePkg).getParentFile(), "android/libs").absolutePath\n` +
      `} catch (ignored) {}\n\n`;
    src = src.replace(/allprojects \{\n(\s*)repositories \{\n/, (m, indent) =>
      `${block}${m}${indent}  if (notifeeLibsDir != null) {\n${indent}    maven { url notifeeLibsDir }\n${indent}  }\n`);
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withIncomingCallScreen(config) {
  config = withManifest(config);
  config = withNativeModuleFile(config);
  config = withActivity(config);
  config = withApplication(config);
  config = withNotifeeRepo(config);
  return config;
};
