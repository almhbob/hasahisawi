/** مكونات مشتركة لشاشات شي إن */
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { neu, NeuRaised } from "@/components/auth/neu";
import { Financials, fmt, SERVICE_BADGE, ServiceState, SheinOrder, SheinStatus, STATUS_META } from "@/lib/shein-api";

export const SHEIN = "#1A2C25";
export const ACCENT = Colors.primary;

export function Shell({ title, sub, insets, right, children }: { title: string; sub?: string; insets: any; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={[u.root, { paddingTop: insets.top }]}>
      <View style={u.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/" as any))} style={u.iconBtn} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={u.title} numberOfLines={1}>{title}</Text>
          {sub ? <Text style={u.sub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function ServiceBadge({ state }: { state: ServiceState }) {
  const b = SERVICE_BADGE[state];
  return (
    <View style={[u.pill, { backgroundColor: b.bg }]}>
      <Ionicons name={b.icon as any} size={12} color={b.color} />
      <Text style={[u.pillText, { color: b.color }]}>{b.label}</Text>
    </View>
  );
}

export function StatusPill({ status, small }: { status: SheinStatus; small?: boolean }) {
  const m = STATUS_META[status];
  return (
    <View style={[u.pill, { backgroundColor: m.color + "18" }]}>
      <Ionicons name={m.icon as any} size={small ? 11 : 13} color={m.color} />
      <Text style={[u.pillText, { color: m.color, fontSize: small ? 11 : 12 }]}>{small ? m.short : m.label}</Text>
    </View>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={u.line}>
      <Text style={[u.lineLabel, muted && { color: Colors.textMuted }, strong && u.strong]}>{label}</Text>
      <Text style={[u.lineValue, muted && { color: Colors.textMuted }, strong && u.strong]}>{value}</Text>
    </View>
  );
}

/** تفصيل التكلفة: السعر، العمولة، الشحن، الإجمالي بالريال والجنيه */
export function CostBreakdown({ f }: { f: Financials }) {
  return (
    <View style={u.cost}>
      <Line label={`سعر المنتج (${f.qty} × ${fmt(f.unit_price_sar, 2)} ر.س)`} value={`${fmt(f.base_price_sar, 2)} ر.س`} />
      <Line label={`عمولة الشراء بالنيابة (${fmt(f.proxy_fee_pct, 1)}% + ${fmt(f.proxy_fee_fixed_sar, 2)})`} value={`${fmt(f.proxy_fee_sar, 2)} ر.س`} />
      <Line label="الشحن داخل السعودية" value={`${fmt(f.local_shipping_sar, 2)} ر.س`} />
      <Line label="الشحن الدولي إلى السودان" value={`${fmt(f.international_shipping_sar, 2)} ر.س`} />
      <View style={u.sep} />
      <Line label="الإجمالي بالريال" value={`${fmt(f.total_sar, 2)} ر.س`} strong />
      <Line label={`سعر الصرف: 1 ر.س = ${fmt(f.sar_to_sdg, 2)} ج.س`} value="" muted />
      <Line label="التوصيل داخل الحصاحيصا" value={`${fmt(f.local_delivery_sdg)} ج.س`} muted />
      <View style={u.total}>
        <Text style={u.totalLabel}>المطلوب تحويله</Text>
        <Text style={u.totalValue}>{fmt(f.total_sdg)} <Text style={{ fontSize: 14 }}>ج.س</Text></Text>
      </View>
    </View>
  );
}

export function OrderCard({ o, onPress, footer, showCustomer }: { o: SheinOrder; onPress?: () => void; footer?: React.ReactNode; showCustomer?: boolean }) {
  const d = o.item_details || ({} as any);
  return (
    <NeuRaised radius={20} depth={6} style={{ padding: 13 }}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress ?? (() => router.push({ pathname: "/shein-order", params: { id: String(o.id) } } as any))} style={{ gap: 8 }}>
        <View style={u.row}>
          <View style={u.thumb}>
            {d.image_url ? <Image source={{ uri: d.image_url }} style={{ width: "100%", height: "100%" }} /> : <Text style={u.thumbText}>SHEIN</Text>}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={[u.row, { justifyContent: "space-between" }]}>
              <Text style={u.cardTitle} numberOfLines={1}>#{o.id} · {d.title || "منتج شي إن"}</Text>
            </View>
            <Text style={u.meta} numberOfLines={1}>
              {[d.size && `المقاس ${d.size}`, d.color && `اللون ${d.color}`, `الكمية ${d.qty}`].filter(Boolean).join(" · ")}
            </Text>
            {showCustomer && o.customer_name ? <Text style={u.meta} numberOfLines={1}><Ionicons name="person-outline" size={11} /> {o.customer_name}</Text> : null}
          </View>
        </View>
        <View style={[u.row, { justifyContent: "space-between" }]}>
          <StatusPill status={o.status} small />
          <Text style={u.price}>{fmt(o.financials?.total_sdg)} ج.س</Text>
        </View>
        {o.tracking_number ? <Text style={u.meta}>رقم التتبع: <Text style={{ fontFamily: "Cairo_700Bold", color: Colors.textPrimary }}>{o.tracking_number}</Text></Text> : null}
      </TouchableOpacity>
      {footer ? <View style={{ marginTop: 10 }}>{footer}</View> : null}
    </NeuRaised>
  );
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ alignItems: "center", padding: 28, gap: 10 }}>
      <Ionicons name={icon as any} size={40} color={Colors.textMuted} />
      <Text style={[u.meta, { textAlign: "center", fontSize: 13 }]}>{text}</Text>
    </View>
  );
}

export function SmallBtn({ label, icon, onPress, color = ACCENT, filled, disabled }: { label: string; icon?: string; onPress: () => void; color?: string; filled?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={[u.sBtn, { borderColor: color + "60", backgroundColor: filled ? color : Colors.cardBg, opacity: disabled ? 0.5 : 1 }]}>
      {icon ? <Ionicons name={icon as any} size={15} color={filled ? "#fff" : color} /> : null}
      <Text style={[u.sBtnText, { color: filled ? "#fff" : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const u = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, alignSelf: "flex-start" },
  pillText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  cost: { gap: 6 },
  line: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  lineLabel: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  lineValue: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textPrimary },
  strong: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 13.5 },
  sep: { height: 1, backgroundColor: Colors.divider, marginVertical: 4 },
  total: { marginTop: 6, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", backgroundColor: ACCENT + "14", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  totalLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: ACCENT },
  totalValue: { fontFamily: "Cairo_700Bold", fontSize: 22, color: ACCENT },
  thumb: { width: 54, height: 54, borderRadius: 14, backgroundColor: SHEIN, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 11, letterSpacing: 1 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", flex: 1 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 15, color: ACCENT },
  sBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.2, flexGrow: 1 },
  sBtnText: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  section: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  card: { padding: 14, gap: 10 },
});
