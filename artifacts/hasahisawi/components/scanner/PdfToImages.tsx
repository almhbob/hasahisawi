/**
 * تحويل PDF إلى صور على الهاتف: pdf.js داخل WebView مخفي يرسم كل صفحة ويرسلها صورةً (JPEG).
 * الاستخدام: <PdfToImages base64={...} onDone={(pages)=>…} onError={…} />
 */
import React, { useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { PDFJS_URLS } from "@/lib/scanner-tools";

const html = `<!doctype html><html><head><meta charset="utf-8"><script src="${PDFJS_URLS.lib}"></script></head><body><script>
window.__render = async function (b64) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS_URLS.worker}";
    var raw = atob(b64), bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    var doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    var n = Math.min(doc.numPages, 30);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "count", n: n }));
    for (var p = 1; p <= n; p++) {
      var page = await doc.getPage(p), vp = page.getViewport({ scale: 1.6 });
      var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "page", i: p, uri: c.toDataURL("image/jpeg", 0.86) }));
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "done" }));
  } catch (e) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error", message: String(e && e.message || e) })); }
};
window.ReactNativeWebView.postMessage(JSON.stringify({ type: "ready" }));
</script></body></html>`;

export default function PdfToImages({ base64, onDone, onError, onProgress }: {
  base64: string; onDone: (pages: string[]) => void; onError: (msg: string) => void; onProgress?: (done: number, total: number) => void;
}) {
  const ref = useRef<WebView>(null);
  const pages = useRef<string[]>([]);
  const total = useRef(0);
  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: "absolute" }} pointerEvents="none">
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        source={{ html, baseUrl: "https://cdnjs.cloudflare.com" }}
        javaScriptEnabled
        onMessage={(e) => {
          let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
          if (m.type === "ready") ref.current?.injectJavaScript(`window.__render(${JSON.stringify(base64)}); true;`);
          else if (m.type === "count") total.current = m.n;
          else if (m.type === "page") { pages.current.push(m.uri); onProgress?.(pages.current.length, total.current); }
          else if (m.type === "done") onDone(pages.current);
          else if (m.type === "error") onError(m.message || "تعذّر قراءة ملف PDF");
        }}
        onError={() => onError("تعذّر تحميل أداة PDF — تحقق من الاتصال")}
      />
    </View>
  );
}
