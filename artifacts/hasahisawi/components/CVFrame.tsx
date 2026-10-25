import React from "react";
import { Platform, View } from "react-native";

const PAGE_W = 794;
const PAGE_H = 1123;

/** يعرض صفحة HTML بمقاس A4 مصغّرة إلى العرض المطلوب (معاينة حيّة مطابقة للـ PDF) */
export default function CVFrame({ html, width }: { html: string; width: number }) {
  const scale = width / PAGE_W;
  const height = Math.round(PAGE_H * scale);
  if (Platform.OS === "web") {
    return (
      <View style={{ width, height, overflow: "hidden", borderRadius: 12, backgroundColor: "#fff" }}>
        {React.createElement("iframe", {
          srcDoc: html, title: "معاينة السيرة الذاتية",
          style: { width: PAGE_W, height: PAGE_H, border: 0, transform: `scale(${scale})`, transformOrigin: "top right", pointerEvents: "none" },
        })}
      </View>
    );
  }
  const { WebView } = require("react-native-webview");
  return (
    <View style={{ width, height, overflow: "hidden", borderRadius: 12, backgroundColor: "#fff" }}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={{ width, height, backgroundColor: "#fff" }}
        scalesPageToFit
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        setBuiltInZoomControls={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL="file:///"
        pointerEvents="none"
      />
    </View>
  );
}
