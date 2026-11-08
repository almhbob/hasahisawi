/**
 * محرّك الماسح على الهاتف: WebView مخفي يشغّل نفس كود المتصفح (lib/scan-cv-source) ويعيد النتيجة.
 * يُوضع مرة واحدة في شاشة الماسح. على الويب لا يُرسم شيء (المحرّك يعمل مباشرة).
 */
import React, { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import { SCAN_CV_SOURCE } from "@/lib/scan-cv-source";
import { registerNativeRunner } from "@/lib/scan-engine";

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${SCAN_CV_SOURCE}
window.__run = function (id, op, args) {
  window.HScan[op].apply(null, args)
    .then(function (r) { window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, ok: true, r: r })); })
    .catch(function (e) { window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, ok: false, e: String(e && e.message || e) })); });
};
window.ReactNativeWebView.postMessage(JSON.stringify({ ready: true }));
</script></body></html>`;

export default function ScanEngine() {
  const ref = useRef<WebView>(null);
  const pending = useRef(new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>());
  const seq = useRef(0);

  useEffect(() => () => registerNativeRunner(null), []);
  if (Platform.OS === "web") return null;

  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: "absolute" }} pointerEvents="none">
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
        onMessage={(e) => {
          let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (m.ready) {
            registerNativeRunner((op, args) => new Promise((res, rej) => {
              const id = ++seq.current;
              pending.current.set(id, { res, rej });
              ref.current?.injectJavaScript(`window.__run(${id}, ${JSON.stringify(op)}, ${JSON.stringify(args)}); true;`);
            }));
            return;
          }
          const p = pending.current.get(m.id);
          if (!p) return;
          pending.current.delete(m.id);
          m.ok ? p.res(m.r) : p.rej(new Error(m.e || "تعذّرت المعالجة"));
        }}
      />
    </View>
  );
}
