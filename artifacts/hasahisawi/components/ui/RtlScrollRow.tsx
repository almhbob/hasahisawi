import React, { useRef, useState } from "react";
import { Platform, ScrollView, type ScrollViewProps } from "react-native";

/**
 * صف أفقي قابل للتمرير يبدأ من اليمين، وأول عناصره في أقصى اليمين.
 *
 * - على الهاتف: التطبيق يفرض اتجاه LTR ويعكس الصفوف بـ row-reverse، فيبدأ التمرير
 *   من اليسار ويُظهر آخر العناصر بدل أولها. نمرّر إلى النهاية بعد القياس.
 * - على الويب بالعربية: عنصر التمرير نفسه RTL، فيكفي صف عادي (row) يسير من اليمين
 *   ويبدأ التمرير من اليمين تلقائياً.
 * ولا يتمدد الصف عمودياً، فلا تقصّه القائمة التي تحته.
 */
export default function RtlScrollRow({ contentContainerStyle, style, onContentSizeChange, children, ...rest }: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  const [webRtl, setWebRtl] = useState(false);

  const showFirstItems = () => {
    const sv = ref.current;
    if (!sv) return;
    if (Platform.OS === "web") {
      const node = (sv as any).getScrollableNode?.() as HTMLElement | undefined;
      if (node && typeof getComputedStyle === "function" && getComputedStyle(node).direction === "rtl") {
        if (!webRtl) setWebRtl(true);
        node.scrollLeft = 0;
        return;
      }
    }
    sv.scrollToEnd({ animated: false });
  };

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ flexGrow: 0, flexShrink: 0 }, style]}
      contentContainerStyle={[contentContainerStyle, { flexDirection: webRtl ? "row" : "row-reverse" }]}
      onContentSizeChange={(w, h) => {
        showFirstItems();
        onContentSizeChange?.(w, h);
      }}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
