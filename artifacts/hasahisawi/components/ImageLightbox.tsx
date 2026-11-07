/**
 * عارض صورة بملء الشاشة قابل للتكبير (قرص بإصبعين، نقر مزدوج، أزرار +/−) مع زر مشاركة.
 * يبني على ZoomViewer ويقيس أبعاد الصورة حتى تُعرض بنسبتها الحقيقية.
 */
import React, { useEffect, useState } from "react";
import { Image, Platform, Share, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ZoomViewer from "@/components/srcs/ZoomViewer";
import { openExternal } from "@/lib/xplatform";

export default function ImageLightbox({ uri, onClose, title = "صورة" }: { uri: string | null; onClose: () => void; title?: string }) {
  const [ratio, setRatio] = useState(1);

  useEffect(() => {
    if (!uri) return;
    setRatio(1);
    Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setRatio(h / w); }, () => {});
  }, [uri]);

  const share = async () => {
    if (!uri) return;
    try {
      if (Platform.OS === "web") { await openExternal(uri); return; }
      await Share.share({ url: uri, message: uri });
    } catch { /* أُلغيت */ }
  };

  return (
    <ZoomViewer
      visible={!!uri}
      onClose={onClose}
      title={title}
      pages={[{
        label: title,
        ratio,
        render: (w) => <Image source={{ uri: uri || undefined }} style={{ width: w, height: w * ratio, borderRadius: 6 }} resizeMode="contain" />,
      }]}
      actions={
        <TouchableOpacity onPress={share} accessibilityRole="button" accessibilityLabel={Platform.OS === "web" ? "فتح الصورة الأصلية" : "مشاركة الصورة"}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={Platform.OS === "web" ? "open-outline" : "share-social-outline"} size={20} color="#F1EEE6" />
        </TouchableOpacity>
      }
    />
  );
}
