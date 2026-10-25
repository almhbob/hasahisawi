import React, { useCallback, useRef } from "react";
import { ScrollView, StyleSheet, type ScrollViewProps } from "react-native";

/**
 * Horizontal ScrollView for chip, tab and card rows in the Arabic interface.
 *
 * The layout engine is left-to-right and screens mirror themselves for Arabic
 * (see app/_layout.tsx), so a plain horizontal ScrollView puts its first item
 * on the left and opens on the left edge: in a chip row the first item ("الكل")
 * ends up on the wrong side, or cut off at the right edge. HScroll lays the
 * items out from the right, opens scrolled to the right edge, and keeps short
 * rows against the right side.
 */
export default function HScroll({
  contentContainerStyle,
  onContentSizeChange,
  onScrollBeginDrag,
  ...rest
}: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);
  const userScrolled = useRef(false);

  const flat = StyleSheet.flatten(contentContainerStyle) ?? {};
  const isColumn = flat.flexDirection === "column" || flat.flexDirection === "column-reverse";
  const containerStyle = isColumn
    ? contentContainerStyle
    : { flexGrow: 1, ...flat, flexDirection: "row-reverse" as const };

  const handleContentSizeChange = useCallback(
    (w: number, h: number) => {
      // Stay at the start (right edge) while content loads, until the user scrolls.
      if (!userScrolled.current) ref.current?.scrollToEnd({ animated: false });
      onContentSizeChange?.(w, h);
    },
    [onContentSizeChange],
  );

  return (
    <ScrollView
      ref={ref}
      horizontal
      {...rest}
      contentContainerStyle={containerStyle}
      onContentSizeChange={handleContentSizeChange}
      onScrollBeginDrag={(e) => {
        userScrolled.current = true;
        onScrollBeginDrag?.(e);
      }}
    />
  );
}
