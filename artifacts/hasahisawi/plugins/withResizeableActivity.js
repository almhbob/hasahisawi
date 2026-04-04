const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Plugin: withResizeableActivity
 *
 * Adds android:resizeableActivity="true" to the main activity in AndroidManifest.xml.
 * This fixes Google Play's large-screen compatibility warning (foldables, tablets).
 * Required for Android 15+ policy compliance.
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
      activity.$["android:configChanges"] =
        (activity.$["android:configChanges"] || "") +
        "|screenLayout|screenSize|smallestScreenSize";
    }

    return cfg;
  });
};
