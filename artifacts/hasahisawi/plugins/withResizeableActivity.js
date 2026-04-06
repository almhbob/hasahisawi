const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Plugin: withResizeableActivity
 *
 * 1. Adds android:resizeableActivity="true" — required for foldable/large-screen compat.
 * 2. Changes android:screenOrientation to "fullUser" — required for Android 16 large-screen
 *    policy (Google Play). "fullUser" respects the device's auto-rotation setting instead
 *    of hard-locking to portrait, satisfying the policy without forcing landscape on phones.
 * 3. Adds configChanges to handle screen size/layout changes gracefully.
 */
module.exports = function withResizeableActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    const activity = app.activity?.find(
      (a) => a.$?.["android:name"] === ".MainActivity"
    );

    if (activity) {
      activity.$["android:resizeableActivity"] = "true";
      activity.$["android:screenOrientation"] = "fullUser";
      const existing = activity.$["android:configChanges"] || "";
      const additions = ["screenLayout", "screenSize", "smallestScreenSize"];
      const parts = existing ? existing.split("|") : [];
      additions.forEach((a) => { if (!parts.includes(a)) parts.push(a); });
      activity.$["android:configChanges"] = parts.join("|");
    }

    return cfg;
  });
};
