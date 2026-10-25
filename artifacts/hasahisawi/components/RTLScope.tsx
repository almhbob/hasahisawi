import React from "react";
import { View } from "react-native";

// شاشات كُتبت على افتراض أن اتجاه النظام RTL (تستخدم flexDirection: "row").
// بعد تثبيت الاتجاه الأساسي LTR (انظر app/_layout.tsx) نعيد لها RTL محلياً
// حتى تبقى بنفس الشكل الصحيح دون إعادة كتابة كل أنماطها.
export function withRTLScreen<P extends object>(C: React.ComponentType<P>) {
  const W = (props: P) => (
    <View style={{ flex: 1, direction: "rtl" }}>
      <C {...props} />
    </View>
  );
  W.displayName = `RTL(${C.displayName || C.name || "Screen"})`;
  return W;
}

export function withRTLBlock<P extends object>(C: React.ComponentType<P>) {
  const W = (props: P) => (
    <View style={{ direction: "rtl" }}>
      <C {...props} />
    </View>
  );
  W.displayName = `RTL(${C.displayName || C.name || "Block"})`;
  return W;
}
