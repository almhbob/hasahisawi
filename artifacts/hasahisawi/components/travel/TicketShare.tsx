// تذكرة السفر كصورة احترافية (Boarding Pass) جاهزة للمشاركة أو الحفظ.
import React, { useRef, useState } from "react";
import { View, Text, Image, Modal, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions, Linking } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
// @ts-ignore
import QRCode from "react-native-qrcode-svg";
import { shareViewAsImage } from "@/lib/share-image";
import { notify } from "@/lib/xplatform";
import { getApiUrl } from "@/lib/query-client";

export type TicketData = {
  id: number; company_name: string; booking_ref: string; ticket_number: string;
  from_city: string; to_city: string; travel_date: string; departure_time: string;
  passenger_name: string; passenger_phone?: string; seat_number: string; price: number | string;
  status: string; payment_status?: string; verify_token?: string;
};

const LOGO = require("@/assets/images/member-card/logo-f1eee6.png");

const INK = "#0B1F3A";
const NAVY = "#10294D";
const GOLD = "#D6A63B";
const PAPER = "#FBF8F1";
const MUTED = "#6B7487";

const STATUS: Record<string, { label: string; color: string }> = {
  confirmed:   { label: "مؤكّدة",  color: "#15803D" },
  rescheduled: { label: "مؤجّلة",  color: "#B45309" },
  cancelled:   { label: "ملغاة",   color: "#B91C1C" },
  pending:     { label: "قيد التأكيد", color: "#B45309" },
};
const PAY: Record<string, string> = {
  pending_payment: "بانتظار الدفع", proof_submitted: "الإيصال قيد المراجعة",
  verified: "مدفوعة ✓", rejected: "الإيصال مرفوض", free: "بلا رسوم",
};

export const cityCode = (name: string, codes: Record<string, string>) =>
  codes[name] || name.replace(/\s/g, "").slice(0, 3);

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ar-SD", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function verifyUrlFor(t: TicketData) {
  return t.verify_token ? `${getApiUrl()}/api/travel/verify/${t.verify_token}` : `${getApiUrl()}/api/travel/verify/${t.ticket_number}`;
}

/** Fixed 4:5 poster. Everything scales from `width` so the exported PNG is crisp. */
export function TicketPoster({ ticket, width, codes }: { ticket: TicketData; width: number; codes: Record<string, string> }) {
  const s = width / 360;
  const st = STATUS[ticket.status] ?? STATUS.pending;
  const price = Number(ticket.price) || 0;
  const t = (size: number, lh = 1.6) => ({ fontSize: size * s, lineHeight: size * s * lh });
  const Cell = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
    <View style={{ width: wide ? "100%" : "50%", paddingVertical: 6 * s, paddingHorizontal: 4 * s }}>
      <Text style={[{ fontFamily: "Cairo_400Regular", color: MUTED, textAlign: "right" }, t(9.5)]}>{label}</Text>
      <Text numberOfLines={1} style={[{ fontFamily: "Cairo_700Bold", color: INK, textAlign: "right" }, t(13)]}>{value || "—"}</Text>
    </View>
  );
  const notch = 14 * s;
  return (
    <View collapsable={false} style={{ width, height: width * 1.25, backgroundColor: "#E9E4D8", padding: 18 * s, justifyContent: "center" }}>
      <View style={{ flex: 1, backgroundColor: PAPER, borderRadius: 18 * s, overflow: "hidden" }}>
        {/* header */}
        <View style={{ backgroundColor: NAVY, paddingHorizontal: 16 * s, paddingTop: 14 * s, paddingBottom: 16 * s }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 * s }}>
              <Image source={LOGO} resizeMode="contain" style={{ width: 22 * s, height: 22 * s }} />
              <View>
                <Text style={[{ fontFamily: "Cairo_700Bold", color: "#F6F1E4", textAlign: "right" }, t(12.5, 1.4)]}>حصاحيصاوي · السفريات</Text>
                <Text numberOfLines={1} style={[{ fontFamily: "Cairo_400Regular", color: "#C9D3E3", textAlign: "right" }, t(9.5, 1.4)]}>{ticket.company_name || "خدمة السفر"}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: "#FFFFFF", borderRadius: 20 * s, paddingHorizontal: 10 * s, paddingVertical: 2 * s }}>
              <Text style={[{ fontFamily: "Cairo_700Bold", color: st.color }, t(10, 1.5)]}>{st.label}</Text>
            </View>
          </View>
          {/* route */}
          <View style={{ flexDirection: "row-reverse", alignItems: "center", marginTop: 14 * s }}>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={[{ fontFamily: "Cairo_700Bold", color: "#FFFFFF", letterSpacing: 1 }, t(28, 1.25)]}>{cityCode(ticket.from_city, codes)}</Text>
              <Text numberOfLines={1} style={[{ fontFamily: "Cairo_600SemiBold", color: "#C9D3E3" }, t(11, 1.4)]}>{ticket.from_city}</Text>
            </View>
            <View style={{ width: 92 * s, alignItems: "center" }}>
              <MaterialCommunityIcons name="bus-side" size={22 * s} color={GOLD} />
              <View style={{ flexDirection: "row", gap: 3 * s, marginTop: 4 * s }}>
                {Array.from({ length: 9 }).map((_, i) => <View key={i} style={{ width: 4 * s, height: 2 * s, borderRadius: 1, backgroundColor: "#5F7397" }} />)}
              </View>
            </View>
            <View style={{ flex: 1, alignItems: "flex-start" }}>
              <Text style={[{ fontFamily: "Cairo_700Bold", color: "#FFFFFF", letterSpacing: 1 }, t(28, 1.25)]}>{cityCode(ticket.to_city, codes)}</Text>
              <Text numberOfLines={1} style={[{ fontFamily: "Cairo_600SemiBold", color: "#C9D3E3" }, t(11, 1.4)]}>{ticket.to_city}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 3 * s, backgroundColor: GOLD }} />

        {/* details */}
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", paddingHorizontal: 12 * s, paddingTop: 8 * s }}>
          <Cell label="اسم الراكب" value={ticket.passenger_name} wide />
          <Cell label="تاريخ السفر" value={fmtDate(ticket.travel_date)} wide />
          <Cell label="وقت المغادرة" value={ticket.departure_time} />
          <Cell label="رقم المقعد" value={ticket.seat_number} />
          <Cell label="قيمة التذكرة" value={price ? `${price.toLocaleString("ar")} ج.س` : "تحدّدها الشركة"} />
          <Cell label="حالة الدفع" value={PAY[ticket.payment_status || ""] || "—"} />
        </View>

        {/* perforation */}
        <View style={{ height: notch * 2, justifyContent: "center", marginTop: 4 * s }}>
          <View style={{ position: "absolute", right: -notch, width: notch * 2, height: notch * 2, borderRadius: notch, backgroundColor: "#E9E4D8" }} />
          <View style={{ position: "absolute", left: -notch, width: notch * 2, height: notch * 2, borderRadius: notch, backgroundColor: "#E9E4D8" }} />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 5 * s, paddingHorizontal: notch + 4 * s }}>
            {Array.from({ length: 22 }).map((_, i) => <View key={i} style={{ width: 7 * s, height: 1.5 * s, backgroundColor: "#CFC6B2" }} />)}
          </View>
        </View>

        {/* stub */}
        <View style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16 * s, paddingBottom: 12 * s, gap: 12 * s }}>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontFamily: "Cairo_400Regular", color: MUTED, textAlign: "right" }, t(9.5)]}>رقم التذكرة</Text>
            <Text style={[{ fontFamily: "Cairo_700Bold", color: INK, textAlign: "right", letterSpacing: 0.5 }, t(13.5)]}>{ticket.ticket_number}</Text>
            <Text style={[{ fontFamily: "Cairo_400Regular", color: MUTED, textAlign: "right", marginTop: 4 * s }, t(9.5)]}>رمز الحجز</Text>
            <Text style={[{ fontFamily: "Cairo_700Bold", color: NAVY, textAlign: "right" }, t(13)]}>{ticket.booking_ref}</Text>
            <Text style={[{ fontFamily: "Cairo_400Regular", color: MUTED, textAlign: "right", marginTop: 6 * s }, t(9, 1.5)]}>احضر قبل موعد المغادرة بـ 30 دقيقة · امسح الرمز للتحقّق</Text>
          </View>
          <View style={{ backgroundColor: "#FFFFFF", padding: 6 * s, borderRadius: 10 * s, borderWidth: 1, borderColor: "#E6DFCF" }}>
            <QRCode value={verifyUrlFor(ticket)} size={92 * s} color={INK} backgroundColor="#FFFFFF" ecl="M" />
          </View>
        </View>
      </View>
    </View>
  );
}

function shareText(t: TicketData) {
  return `🎫 تذكرة سفر — حصاحيصاوي\n${t.from_city} ← ${t.to_city}\n📅 ${fmtDate(t.travel_date)} · ⏰ ${t.departure_time || "—"}\n👤 ${t.passenger_name} · 💺 ${t.seat_number || "—"}\nرقم التذكرة: ${t.ticket_number}\nتحقّق: ${verifyUrlFor(t)}`;
}

export default function TicketShareModal({ ticket, codes, onClose }: { ticket: TicketData | null; codes: Record<string, string>; onClose: () => void }) {
  const ref = useRef<View>(null);
  const { width: winW } = useWindowDimensions();
  const w = Math.min(winW - 40, 380);
  const [busy, setBusy] = useState<null | "share" | "save">(null);

  const run = async (mode: "share" | "save") => {
    if (!ticket) return;
    setBusy(mode);
    try {
      const r = await shareViewAsImage(ref, {
        fileName: `ticket-${ticket.ticket_number}.png`, caption: shareText(ticket), dialogTitle: "مشاركة التذكرة", mode,
      });
      if (r === "downloaded") notify("تم حفظ صورة التذكرة", "تجدها في مجلد التنزيلات، ويمكنك إرسالها عبر واتساب أو أي تطبيق.");
    } catch (e: any) {
      notify("تعذّرت مشاركة الصورة", "جرّب مرة أخرى أو أرسل التذكرة نصاً عبر واتساب.");
    } finally { setBusy(null); }
  };

  return (
    <Modal visible={!!ticket} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.bg}>
        <ScrollView contentContainerStyle={{ alignItems: "center", paddingVertical: 28 }} style={{ alignSelf: "stretch" }} showsVerticalScrollIndicator={false}>
          <View style={{ borderRadius: 16, overflow: "hidden" }}>
            <View ref={ref} collapsable={false}>{ticket && <TicketPoster ticket={ticket} width={w} codes={codes} />}</View>
          </View>
          <View style={[st.sheet, { width: w }]}>
            <Text style={st.title}>شارك تذكرتك كصورة</Text>
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <TouchableOpacity style={[st.btn, { backgroundColor: "#10294D" }]} onPress={() => run("share")} disabled={!!busy}>
                {busy === "share" ? <ActivityIndicator color="#fff" /> : <Ionicons name="share-social" size={18} color="#fff" />}
                <Text style={st.btnText}>مشاركة الصورة</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btn, { backgroundColor: "#D6A63B" }]} onPress={() => run("save")} disabled={!!busy}>
                {busy === "save" ? <ActivityIndicator color="#fff" /> : <Ionicons name="download-outline" size={18} color="#fff" />}
                <Text style={st.btnText}>حفظ الصورة</Text>
              </TouchableOpacity>
            </View>
            {ticket && (
              <TouchableOpacity style={st.wa} onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText(ticket))}`)}>
                <Ionicons name="logo-whatsapp" size={17} color="#128C7E" />
                <Text style={st.waText}>إرسال التفاصيل نصاً عبر واتساب</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={st.close}><Text style={st.closeText}>إغلاق</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(8,15,30,0.78)" },
  sheet: { backgroundColor: "#fff", borderRadius: 18, padding: 16, marginTop: 14, gap: 12 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#0B1F3A", textAlign: "center" },
  btn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  wa: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "#BFE7DD", backgroundColor: "#F1FBF8" },
  waText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "#0F766E" },
  close: { alignItems: "center", paddingVertical: 6 },
  closeText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#6B7487" },
});
