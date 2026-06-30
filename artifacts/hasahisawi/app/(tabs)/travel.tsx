import React, { useState, useCallback, useEffect, useRef } from "react";
// @ts-ignore
import QRCode from "react-native-qrcode-svg";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Modal, Share, Linking, KeyboardAvoidingView,
  ActivityIndicator, FlatList, Pressable, Dimensions,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, Easing, ZoomIn, SlideInRight,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useFocusEffect, router } from "expo-router";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import GuestGate from "@/components/GuestGate";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { scheduleOccasionReminder } from "@/lib/firebase/notifications";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader from "@/components/ui/ModernHeader";


// ═══════════════════════════════════════════════════════════════
// الثوابت والأنواع
// ═══════════════════════════════════════════════════════════════
const ACCENT   = "#0EA5E9";
const ACCENT2  = "#38BDF8";
const GOLD     = "#F59E0B";
const SCREEN_W = Dimensions.get("window").width;

const SUDANESE_CITIES = [
  "الحصاحيصا","الخرطوم","أم درمان","بحري","ود مدني","القضارف",
  "كسلا","بورتسودان","عطبرة","شندي","كريمة","دنقلا","الأبيض",
  "نيالا","الفاشر","ربك","الدمازين","سنار","كوستي","الجنينة",
];

const CITY_CODES: Record<string, string> = {
  "الحصاحيصا":"HSW","الخرطوم":"KHT","أم درمان":"UMD","بحري":"BHR",
  "ود مدني":"WMD","القضارف":"GDF","كسلا":"KSL","بورتسودان":"PSD",
  "عطبرة":"ATB","شندي":"SHD","كريمة":"KRM","دنقلا":"DNG",
  "الأبيض":"ELO","نيالا":"NYL","الفاشر":"ELF","ربك":"RBK",
  "الدمازين":"DMZ","سنار":"SNR","كوستي":"KST","الجنينة":"ELG",
};

type TravelCompany = {
  id: number; name: string; owner_name: string;
  phone: string; wa_number: string; logo_url: string;
  commission_pct: number; subscription_type: string; active: boolean;
};

type TravelRoute = {
  id: number; company_id: number; company_name: string;
  from_city: string; to_city: string; departure_time: string;
  price: number; seats_total: number;
  company_phone: string; company_wa: string;
};

type TravelBooking = {
  id: number; company_name: string; from_city: string; to_city: string;
  travel_date: string; departure_time: string; passenger_name: string;
  passenger_phone: string; seat_number: string; price: number;
  status: "confirmed" | "cancelled" | "completed" | "rescheduled";
  ticket_number: string; booking_ref: string; notes: string; created_at: string;
  payment_status: "pending_payment" | "proof_submitted" | "verified" | "rejected" | "free";
  payment_proof_url: string; payment_ref: string; payment_rejection_reason: string;
  verify_token: string; scan_count: number; scanned_at: string;
};

type CompanyPayment = {
  id: number; name: string;
  payment_account_type: string; payment_account_number: string;
  payment_account_name: string; payment_booking_timeout_hrs: number;
};

// ═══════════════════════════════════════════════════════════════
// مكوّن بطاقة التذكرة (Boarding Pass)
// ═══════════════════════════════════════════════════════════════
function TicketCard({
  booking, onCancel, onReschedule, onShare, onWhatsApp,
}: {
  booking: TravelBooking;
  onCancel?: () => void;
  onReschedule?: () => void;
  onShare: () => void;
  onWhatsApp: () => void;
}) {
  const fromCode = CITY_CODES[booking.from_city] || booking.from_city.slice(0,3).toUpperCase();
  const toCode   = CITY_CODES[booking.to_city]   || booking.to_city.slice(0,3).toUpperCase();
  const dateObj  = new Date(booking.travel_date);
  const dateStr  = dateObj.toLocaleDateString("ar-SD", { weekday:"short", year:"numeric", month:"short", day:"numeric" });

  const statusColors: Record<string, [string,string]> = {
    confirmed:   ["#16A34A","#DCFCE7"],
    rescheduled: ["#D97706","#FEF3C7"],
    cancelled:   ["#DC2626","#FEE2E2"],
    completed:   ["#6366F1","#EEF2FF"],
  };
  const [sColor, sBg] = statusColors[booking.status] ?? ["#64748B","#F1F5F9"];
  const statusLabel: Record<string, string> = {
    confirmed:"مؤكدة", rescheduled:"مُعاد جدولتها", cancelled:"ملغاة", completed:"مكتملة",
  };

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.ticketWrap}>
      <LinearGradient
        colors={booking.status === "cancelled" ? ["#1E293B","#334155"] : ["#0C1D3A","#1E3A5F","#0C4A6E"]}
        start={{ x:0, y:0 }} end={{ x:1, y:1 }}
        style={styles.ticketCard}
      >
        {/* رأس التذكرة */}
        <View style={styles.ticketHeader}>
          <View style={styles.ticketHeaderLeft}>
            <View style={styles.airlineLogoWrap}>
              <MaterialCommunityIcons name="bus" size={20} color={ACCENT2} />
            </View>
            <View>
              <Text style={styles.ticketAirline}>{booking.company_name || "خدمة السفر"}</Text>
              <Text style={styles.ticketBookingRef}>#{booking.booking_ref}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sBg }]}>
            <Text style={[styles.statusText, { color: sColor }]}>{statusLabel[booking.status]}</Text>
          </View>
        </View>

        {/* مسار الرحلة */}
        <View style={styles.routeRow}>
          <View style={styles.cityBlock}>
            <Text style={styles.cityCode}>{fromCode}</Text>
            <Text style={styles.cityName} numberOfLines={1}>{booking.from_city}</Text>
          </View>
          <View style={styles.routeCenter}>
            <View style={styles.routeLine} />
            <MaterialCommunityIcons name="bus-clock" size={22} color={ACCENT2} style={styles.planIcon} />
            <View style={styles.routeLine} />
          </View>
          <View style={[styles.cityBlock, { alignItems:"flex-start" }]}>
            <Text style={styles.cityCode}>{toCode}</Text>
            <Text style={styles.cityName} numberOfLines={1}>{booking.to_city}</Text>
          </View>
        </View>

        {/* خط مشفّر دائري */}
        <View style={styles.tearLine}>
          <View style={styles.tearCircleLeft} />
          <View style={styles.dashedRow}>
            {Array.from({length:18}).map((_,i)=>(
              <View key={i} style={styles.dashSegment} />
            ))}
          </View>
          <View style={styles.tearCircleRight} />
        </View>

        {/* تفاصيل التذكرة */}
        <View style={styles.ticketDetails}>
          <TicketDetailItem label="الراكب"      value={booking.passenger_name} icon="person-outline" />
          <TicketDetailItem label="تاريخ السفر" value={dateStr}                icon="calendar-outline" />
          <TicketDetailItem label="وقت المغادرة"value={booking.departure_time || "—"} icon="time-outline" />
          <TicketDetailItem label="رقم المقعد"  value={booking.seat_number || "—"}    icon="grid-outline" />
          <TicketDetailItem label="السعر"        value={`${Number(booking.price).toLocaleString("ar")} ج.س`} icon="cash-outline" />
          {booking.passenger_phone ? (
            <TicketDetailItem label="رقم الهاتف" value={booking.passenger_phone} icon="call-outline" />
          ) : null}
        </View>

        {/* QR Code حقيقي للتحقق */}
        <View style={styles.qrSection}>
          <View style={[styles.qrBox, { width:80, height:80, padding:6 }]}>
            {booking.verify_token ? (
              <QRCode
                value={`${getApiUrl()}/travel/verify/${booking.verify_token}`}
                size={68}
                backgroundColor="#ffffff"
                color="#000000"
              />
            ) : (
              <QRVisual code={booking.ticket_number} />
            )}
          </View>
          <View style={styles.ticketNumberBlock}>
            <Text style={styles.ticketNumberLabel}>رقم التذكرة</Text>
            <Text style={styles.ticketNumberValue}>{booking.ticket_number}</Text>
            <Text style={{ fontSize:10, color:"#64748B", marginTop:3 }}>امسح الكود للتحقق من صحة التذكرة</Text>
            {booking.scan_count > 0 && (
              <View style={{ flexDirection:"row", alignItems:"center", marginTop:4, gap:4 }}>
                <Ionicons name="checkmark-circle" size={12} color="#34D399" />
                <Text style={{ fontSize:10, color:"#34D399" }}>
                  تم فحصها {booking.scan_count} {booking.scan_count===1?"مرة":"مرات"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* أزرار */}
        <View style={styles.ticketActions}>
          <TouchableOpacity style={[styles.ticketBtn, styles.shareBtn]} onPress={onShare}>
            <Ionicons name="share-outline" size={16} color="#fff" />
            <Text style={styles.ticketBtnText}>مشاركة</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ticketBtn, styles.waBtn]} onPress={onWhatsApp}>
            <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
            <Text style={styles.ticketBtnText}>واتساب</Text>
          </TouchableOpacity>
          {booking.status === "confirmed" || booking.status === "rescheduled" ? (
            <>
              <TouchableOpacity style={[styles.ticketBtn, styles.rescheduleBtn]} onPress={onReschedule}>
                <Ionicons name="calendar-outline" size={16} color="#fff" />
                <Text style={styles.ticketBtnText}>تأجيل</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ticketBtn, styles.cancelBtn]} onPress={onCancel}>
                <Ionicons name="close-circle-outline" size={16} color="#fff" />
                <Text style={styles.ticketBtnText}>إلغاء</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function TicketDetailItem({ label, value, icon }: { label:string; value:string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={ACCENT2 + "AA"} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function QRVisual({ code }: { code: string }) {
  const seed = code.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const cells = Array.from({length:49}).map((_,i)=>!!((seed*i*7+i*13+seed)%3));
  return (
    <View style={styles.qrGrid}>
      {cells.map((filled,i)=>(
        <View key={i} style={[styles.qrCell, filled ? styles.qrFilled : styles.qrEmpty]} />
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// شاشة تعليمات الدفع بعد الحجز
// ═══════════════════════════════════════════════════════════════
function PaymentInstructions({
  booking, route, onNewBooking, user,
}: { booking: TravelBooking; route: TravelRoute | null; onNewBooking: () => void; user: any }) {
  const [payInfo,   setPayInfo]   = useState<CompanyPayment | null>(null);
  const [payRef,    setPayRef]    = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!route?.company_id) return;
    fetchWithTimeout(`${getApiUrl()}/travel/companies/${route.company_id}/payment`)
      .then(r => r.json()).then(setPayInfo).catch(()=>{});
  }, [route]);

  const submitProof = async () => {
    if (!payRef.trim()) { Alert.alert("تنبيه","أدخل رقم المرجع/العملية"); return; }
    setSubmitting(true);
    try {
      const token = (user as any)?._token || "";
      const r = await fetchWithTimeout(`${getApiUrl()}/travel/bookings/${booking.id}/submit-payment`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ payment_ref: payRef }),
      });
      if (r.ok) {
        setSubmitted(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else { Alert.alert("خطأ","تعذّر إرسال رقم الإيصال"); }
    } catch { Alert.alert("خطأ","تعذّر الاتصال"); }
    finally { setSubmitting(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding:16 }}>
      {/* ✅ تم الحجز */}
      <Animated.View entering={ZoomIn.springify()} style={{ marginBottom:16 }}>
        <LinearGradient colors={["#064E3B","#065F46"]} style={{ borderRadius:20, padding:24, alignItems:"center" }}>
          <Ionicons name="checkmark-circle" size={52} color="#34D399" />
          <Text style={{ fontSize:22, fontWeight:"800", color:"#fff", marginTop:12 }}>تم الحجز بنجاح!</Text>
          <Text style={{ fontSize:14, color:"#6EE7B7", marginTop:4 }}>تذكرة رقم: {booking.ticket_number}</Text>
        </LinearGradient>
      </Animated.View>

      <TicketCard
        booking={booking}
        onShare={() => shareTicket(booking)}
        onWhatsApp={() => sendToWhatsApp(booking)}
      />

      {/* 💳 تعليمات الدفع */}
      {!submitted ? (
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <LinearGradient colors={["#0C2A4A","#1A3D6B"]} style={{ borderRadius:18, padding:20, marginBottom:16 }}>
            <View style={{ flexDirection:"row", alignItems:"center", gap:10, marginBottom:16 }}>
              <View style={{ width:40, height:40, borderRadius:12, backgroundColor:ACCENT+"22", justifyContent:"center", alignItems:"center" }}>
                <Ionicons name="wallet-outline" size={22} color={ACCENT} />
              </View>
              <View>
                <Text style={{ fontSize:16, fontWeight:"800", color:"#fff" }}>تعليمات الدفع</Text>
                <Text style={{ fontSize:12, color:"#93C5FD", marginTop:2 }}>أرسل قيمة التذكرة لإتمام الحجز</Text>
              </View>
            </View>

            {payInfo?.payment_account_number ? (
              <>
                <View style={{ backgroundColor:"#ffffff10", borderRadius:12, padding:14, marginBottom:12 }}>
                  <Text style={{ fontSize:12, color:"#93C5FD", marginBottom:8 }}>ادفع عبر:</Text>
                  {[
                    ["وسيلة الدفع", payInfo.payment_account_type],
                    ["اسم الحساب",  payInfo.payment_account_name],
                    ["رقم الحساب",  payInfo.payment_account_number],
                    ["المبلغ",       `${booking.price} جنيه`],
                  ].map(([l,v]) => (
                    <View key={l} style={{ flexDirection:"row", justifyContent:"space-between", marginBottom:6 }}>
                      <Text style={{ fontSize:12, color:"#93C5FD" }}>{l}</Text>
                      <Text style={{ fontSize:13, color:"#fff", fontWeight:"700" }}>{v}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ backgroundColor:"#F59E0B11", borderRadius:10, padding:12, marginBottom:14 }}>
                  <Text style={{ fontSize:12, color:GOLD }}>
                    ⏳ المهلة: {payInfo.payment_booking_timeout_hrs || 3} ساعات لإرسال الإيصال
                  </Text>
                </View>
              </>
            ) : (
              <View style={{ backgroundColor:"#ffffff10", borderRadius:12, padding:14, marginBottom:12 }}>
                <Text style={{ fontSize:13, color:"#93C5FD", textAlign:"center" }}>
                  📞 تواصل مع الشركة لمعرفة تفاصيل الدفع: {route?.company_phone || ""}
                </Text>
              </View>
            )}

            {/* رقم المرجع */}
            <Text style={{ fontSize:13, color:"#CBD5E1", marginBottom:8 }}>
              بعد الإرسال، أدخل رقم العملية/المرجع:
            </Text>
            <TextInput
              value={payRef}
              onChangeText={setPayRef}
              placeholder="مثال: TXN-123456789"
              placeholderTextColor="#4B6A8A"
              style={{ backgroundColor:"#0A1E38", borderRadius:10, padding:12, color:"#fff", fontSize:14,
                borderWidth:1, borderColor:"#2D5A8A", marginBottom:12, textAlign:"right" }}
            />
            <TouchableOpacity onPress={submitProof} disabled={submitting}
              style={{ backgroundColor:ACCENT, borderRadius:12, padding:14, alignItems:"center", opacity:submitting?0.6:1 }}>
              <Text style={{ color:"#fff", fontWeight:"800", fontSize:15 }}>
                {submitting ? "جاري الإرسال..." : "✓ أرسلت الدفعة — إبلاغ الإدارة"}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      ) : (
        <Animated.View entering={ZoomIn.springify()}>
          <LinearGradient colors={["#064E3B","#065F46"]} style={{ borderRadius:16, padding:18, marginBottom:16, alignItems:"center" }}>
            <Ionicons name="checkmark-circle" size={36} color="#34D399" />
            <Text style={{ fontSize:16, fontWeight:"700", color:"#fff", marginTop:8 }}>تم إرسال إشعار الدفع!</Text>
            <Text style={{ fontSize:13, color:"#6EE7B7", marginTop:4, textAlign:"center" }}>
              سيتم تأكيد حجزك خلال دقائق بعد مراجعة الإدارة
            </Text>
          </LinearGradient>
        </Animated.View>
      )}

      <TouchableOpacity onPress={onNewBooking} style={styles.newBookingBtn}>
        <Text style={styles.newBookingBtnText}>حجز رحلة جديدة</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function getUpcomingTravelDates() {
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const label = index === 0 ? "اليوم" : index === 1 ? "غداً" : date.toLocaleDateString("ar-SD", { weekday: "short", day: "numeric", month: "short" });
    return { iso, label };
  });
}

// ═══════════════════════════════════════════════════════════════
// نموذج الحجز
// ═══════════════════════════════════════════════════════════════
function BookingForm({ user, onBooked }: { user: any; onBooked: (b: TravelBooking) => void }) {
  const [fromCity,   setFromCity]   = useState("الحصاحيصا");
  const [toCity,     setToCity]     = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [passengerName,  setPassengerName]  = useState(user?.name || "");
  const [passengerPhone, setPassengerPhone] = useState(user?.phone || "");
  const [selectedRoute,  setSelectedRoute]  = useState<TravelRoute | null>(null);
  const [routes,    setRoutes]    = useState<TravelRoute[]>([]);
  const [companies, setCompanies] = useState<TravelCompany[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [submitting,setSubmitting]= useState(false);
  const [step,      setStep]      = useState<"form"|"route"|"confirm"|"done">("form");
  const [cityPicker,setCityPicker]= useState<"from"|"to"|null>(null);
  const [newBooking, setNewBooking]= useState<TravelBooking | null>(null);

  useEffect(() => {
    fetchWithTimeout(`${getApiUrl()}/travel/companies`)
      .then(r => r.json())
      .then(d => setCompanies(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const searchRoutes = useCallback(async () => {
    if (!fromCity || !toCity) { Alert.alert("تنبيه","اختر مدينة الانطلاق والوجهة"); return; }
    setLoading(true);
    try {
      const url = `${getApiUrl()}/travel/routes?from_city=${encodeURIComponent(fromCity)}&to_city=${encodeURIComponent(toCity)}`;
      const r   = await fetchWithTimeout(url);
      const data = await r.json();
      if (!r.ok) throw new Error();
      setRoutes(data);
      setStep("route");
    } catch { Alert.alert("خطأ","تعذّر البحث عن الرحلات"); }
    finally  { setLoading(false); }
  }, [fromCity, toCity]);

  const submitBooking = useCallback(async () => {
    if (!passengerName.trim()) { Alert.alert("تنبيه","أدخل اسم الراكب"); return; }
    if (!travelDate)           { Alert.alert("تنبيه","أدخل تاريخ السفر (YYYY-MM-DD)"); return; }
    setSubmitting(true);
    try {
      const token = (user as any)?._token || "";
      const r = await fetchWithTimeout(`${getApiUrl()}/travel/bookings`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({
          company_id:    selectedRoute?.company_id || null,
          route_id:      selectedRoute?.id || null,
          from_city:     fromCity,
          to_city:       toCity,
          travel_date:   travelDate,
          departure_time:selectedRoute?.departure_time || "",
          passenger_name:passengerName,
          passenger_phone:passengerPhone,
          price:         selectedRoute?.price || 0,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "خطأ");
      setNewBooking(data);
      setStep("done");
      onBooked(data);
      // جدولة تذكير قبل ساعتين
      try {
        const travelDT = new Date(`${travelDate}T${selectedRoute?.departure_time || "08:00"}:00`);
        const reminderAt = new Date(travelDT.getTime() - 2 * 60 * 60 * 1000);
        if (reminderAt > new Date()) {
          await scheduleOccasionReminder(
            {
              title: "🚌 تذكير — رحلتك بعد ساعتين!",
              body:  `رحلتك من ${fromCity} إلى ${toCity} تنطلق في تمام ${selectedRoute?.departure_time || ""}. تذكرتك: ${data.ticket_number}`,
              data:  { type:"travel_reminder", booking_id: data.id },
            },
            reminderAt
          );
        }
      } catch {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("خطأ", err.message || "تعذّر الحجز");
    } finally { setSubmitting(false); }
  }, [fromCity, toCity, travelDate, passengerName, passengerPhone, selectedRoute, user, onBooked]);

  if (step === "done" && newBooking) {
    return (
      <PaymentInstructions
        booking={newBooking}
        route={selectedRoute}
        onNewBooking={() => { setStep("form"); setRoutes([]); setSelectedRoute(null); setNewBooking(null); }}
        user={user}
      />
    );
  }

  if (step === "route") {
    return (
      <ScrollView contentContainerStyle={{ padding:16 }}>
        <View style={styles.sectionHeader}>
          <TouchableOpacity onPress={()=>setStep("form")} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>اختر رحلتك</Text>
        </View>
        {routes.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="bus-clock" size={56} color={ACCENT+"44"} />
            <Text style={styles.emptyTitle}>لا توجد رحلات متاحة</Text>
            <Text style={styles.emptySub}>جرّب مدن مختلفة أو تواصل مع شركات النقل مباشرة</Text>
          </View>
        ) : (
          routes.map(route => (
            <AnimatedPress key={route.id} onPress={()=>{ setSelectedRoute(route); setStep("confirm"); }}>
              <View style={[styles.routeCard, selectedRoute?.id===route.id && styles.routeCardSelected]}>
                <View style={styles.routeCardLeft}>
                  <Text style={styles.routeCardCompany}>{route.company_name}</Text>
                  <View style={styles.routeCardCities}>
                    <Text style={styles.routeCardCity}>{route.from_city}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={16} color={ACCENT} />
                    <Text style={styles.routeCardCity}>{route.to_city}</Text>
                  </View>
                  <View style={styles.routeCardTime}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.routeCardTimeTxt}>المغادرة: {route.departure_time}</Text>
                  </View>
                </View>
                <View style={styles.routeCardRight}>
                  <Text style={styles.routeCardPrice}>{Number(route.price).toLocaleString("ar")}</Text>
                  <Text style={styles.routeCardCurrency}>ج.س</Text>
                  <View style={styles.selectBtn}>
                    <Text style={styles.selectBtnTxt}>اختر</Text>
                  </View>
                </View>
              </View>
            </AnimatedPress>
          ))
        )}
      </ScrollView>
    );
  }

  if (step === "confirm") {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding:16, paddingBottom:180 }}>
        <View style={styles.sectionHeader}>
          <TouchableOpacity onPress={()=>setStep("route")} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>تأكيد الحجز</Text>
        </View>
        <LinearGradient colors={["#0F2744","#1E3A5F"]} style={styles.confirmCard}>
          <View style={styles.confirmRoute}>
            <Text style={styles.confirmCity}>{fromCity}</Text>
            <MaterialCommunityIcons name="bus" size={24} color={ACCENT2} />
            <Text style={styles.confirmCity}>{toCity}</Text>
          </View>
          <View style={styles.confirmCompanyBadge}><Ionicons name="business-outline" size={14} color={ACCENT2} /><Text style={styles.confirmCompanyBadgeText}>{selectedRoute?.company_name}</Text></View>
          <Text style={styles.confirmTime}>المغادرة: {selectedRoute?.departure_time}</Text>
          <Text style={styles.confirmPrice}>{Number(selectedRoute?.price||0).toLocaleString("ar")} ج.س</Text>
        </LinearGradient>

        <Text style={styles.fieldLabel}>اسم الراكب *</Text>
        <TextInput style={styles.input} value={passengerName} onChangeText={setPassengerName} placeholder="الاسم الثلاثي" />

        <Text style={styles.fieldLabel}>رقم الهاتف</Text>
        <TextInput style={styles.input} value={passengerPhone} onChangeText={setPassengerPhone}
          placeholder="09XXXXXXXX" keyboardType="phone-pad" />

        <Text style={styles.fieldLabel}>تاريخ السفر *</Text>
        <View style={styles.dateChipGrid}>
          {getUpcomingTravelDates().map((date) => (
            <TouchableOpacity key={date.iso} onPress={() => setTravelDate(date.iso)} style={[styles.dateChip, travelDate === date.iso && styles.dateChipActive]}>
              <Ionicons name="calendar-outline" size={14} color={travelDate === date.iso ? "#fff" : ACCENT} />
              <Text style={[styles.dateChipText, travelDate === date.iso && styles.dateChipTextActive]}>{date.label}</Text>
              <Text style={[styles.dateChipSub, travelDate === date.iso && styles.dateChipTextActive]}>{date.iso}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={travelDate} onChangeText={setTravelDate} placeholder="أو أدخل التاريخ: 2026-05-20" placeholderTextColor="#4B6A8A" keyboardType="numbers-and-punctuation" maxLength={10} />

        <AnimatedPress onPress={submitBooking} style={[styles.bookBtn, submitting && { opacity:0.6 }]}>
          {submitting ? <ActivityIndicator color="#fff" />
            : <><MaterialCommunityIcons name="bus-clock" size={20} color="#fff" /><Text style={styles.bookBtnText}>تأكيد الحجز</Text></>}
        </AnimatedPress>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding:16 }}>
      {/* اختيار المدن */}
      <Text style={styles.sectionTitle}>من أين إلى أين؟</Text>
      <View style={styles.cityPickerRow}>
        <TouchableOpacity style={styles.cityPickerBtn} onPress={()=>setCityPicker("from")}>
          <Ionicons name="location" size={16} color={ACCENT} />
          <Text style={styles.cityPickerTxt}>{fromCity || "اختر مدينة الانطلاق"}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={()=>{ setFromCity(toCity); setToCity(fromCity); }} style={styles.swapBtn}>
          <MaterialCommunityIcons name="swap-horizontal" size={22} color={ACCENT} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cityPickerBtn} onPress={()=>setCityPicker("to")}>
          <Ionicons name="location-outline" size={16} color={GOLD} />
          <Text style={styles.cityPickerTxt}>{toCity || "اختر الوجهة"}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <AnimatedPress onPress={searchRoutes} style={[styles.searchBtn, loading && {opacity:0.6}]}>
        {loading ? <ActivityIndicator color="#fff" size="small" />
          : <><Ionicons name="search" size={18} color="#fff" /><Text style={styles.searchBtnTxt}>ابحث عن الرحلات</Text></>}
      </AnimatedPress>

      {/* مدن شهيرة */}
      <Text style={styles.sectionTitle}>وجهات شهيرة</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:16 }}>
        {["الخرطوم","ود مدني","القضارف","كسلا","بورتسودان","عطبرة"].map(city=>(
          <AnimatedPress key={city} onPress={()=>{ if(!fromCity)setFromCity("الحصاحيصا"); setToCity(city); }}
            style={styles.destChip}>
            <Text style={styles.destChipTxt}>{city}</Text>
          </AnimatedPress>
        ))}
      </ScrollView>

      {/* بطاقة عملاء جدد */}
      <LinearGradient colors={["#1E3A5F","#0C4A6E"]} style={styles.infoCard}>
        <MaterialCommunityIcons name="shield-check" size={28} color={ACCENT2} />
        <View style={{ flex:1, marginStart:12 }}>
          <Text style={styles.infoCardTitle}>حجز آمن ومضمون</Text>
          <Text style={styles.infoCardSub}>تذاكرك محفوظة في التطبيق — مع تذكير قبل ساعتين من السفر</Text>
        </View>
      </LinearGradient>

      {/* منتقي المدن */}
      <Modal visible={!!cityPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.cityModal}>
            <View style={styles.cityModalHeader}>
              <Text style={styles.cityModalTitle}>{cityPicker==="from"?"مدينة الانطلاق":"الوجهة"}</Text>
              <TouchableOpacity onPress={()=>setCityPicker(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {SUDANESE_CITIES.map(city=>(
                <TouchableOpacity key={city} style={styles.cityOption}
                  onPress={()=>{ if(cityPicker==="from")setFromCity(city); else setToCity(city); setCityPicker(null); }}>
                  <Text style={styles.cityOptionTxt}>{city}</Text>
                  {(cityPicker==="from"?fromCity:toCity)===city &&
                    <Ionicons name="checkmark" size={18} color={ACCENT} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════
// تبويب تذاكري
// ═══════════════════════════════════════════════════════════════
// باج حالة الدفع
function PaymentBadge({ status }: { status: string }) {
  const MAP: Record<string, { label: string; color: string; bg: string }> = {
    pending_payment:  { label: "في انتظار الدفع",  color: GOLD,      bg: GOLD      + "22" },
    proof_submitted:  { label: "إيصال مُرسَل",     color: "#38BDF8",  bg: "#38BDF822" },
    verified:         { label: "✓ مدفوع ومؤكد",   color: "#34D399",  bg: "#34D39922" },
    rejected:         { label: "✗ مرفوض",          color: "#F87171",  bg: "#F8717122" },
    free:             { label: "بلا رسوم",         color: "#94A3B8",  bg: "#94A3B822" },
  };
  const m = MAP[status] ?? { label: status, color: "#94A3B8", bg: "#94A3B822" };
  return (
    <View style={{ backgroundColor: m.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
      borderWidth:1, borderColor: m.color + "44", alignSelf:"flex-start" }}>
      <Text style={{ fontSize:11, fontWeight:"700", color: m.color }}>{m.label}</Text>
    </View>
  );
}

function MyTickets({ user }: { user: any }) {
  const [bookings, setBookings] = useState<TravelBooking[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState<TravelBooking | null>(null);
  const [payModal, setPayModal]  = useState<TravelBooking | null>(null);
  const [payRef,   setPayRef]    = useState("");
  const [submittingPay, setSubmittingPay] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [filter, setFilter] = useState<"all"|"confirmed"|"cancelled"|"pending_payment">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = (user as any)?._token || "";
      const r = await fetchWithTimeout(`${getApiUrl()}/travel/bookings`, {
        headers:{ Authorization:`Bearer ${token}` },
      });
      const data = await r.json();
      if (r.ok) setBookings(data);
    } catch {}
    finally { setLoading(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCancel = useCallback((booking: TravelBooking) => {
    Alert.alert("إلغاء التذكرة", `هل تريد إلغاء تذكرة ${booking.ticket_number}؟`, [
      { text:"تراجع", style:"cancel" },
      { text:"إلغاء التذكرة", style:"destructive", onPress: async () => {
        try {
          const token = (user as any)?._token || "";
          const r = await fetchWithTimeout(`${getApiUrl()}/travel/bookings/${booking.id}/cancel`, {
            method:"PATCH", headers:{ Authorization:`Bearer ${token}` },
          });
          if (r.ok) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); load(); }
          else Alert.alert("خطأ","تعذّر الإلغاء");
        } catch { Alert.alert("خطأ","تعذّر الاتصال"); }
      }},
    ]);
  }, [user, load]);

  const handleReschedule = useCallback(async () => {
    if (!rescheduleModal || !newDate) return;
    try {
      const token = (user as any)?._token || "";
      const r = await fetchWithTimeout(`${getApiUrl()}/travel/bookings/${rescheduleModal.id}/reschedule`, {
        method:"PATCH",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ new_date: newDate }),
      });
      if (r.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRescheduleModal(null); setNewDate(""); load();
      } else Alert.alert("خطأ","تعذّر التأجيل");
    } catch { Alert.alert("خطأ","تعذّر الاتصال"); }
  }, [rescheduleModal, newDate, user, load]);

  const handleSubmitPayment = useCallback(async () => {
    if (!payModal || !payRef.trim()) { Alert.alert("تنبيه","أدخل رقم المرجع/العملية"); return; }
    setSubmittingPay(true);
    try {
      const token = (user as any)?._token || "";
      const r = await fetchWithTimeout(`${getApiUrl()}/travel/bookings/${payModal.id}/submit-payment`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ payment_ref: payRef }),
      });
      if (r.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPayModal(null); setPayRef(""); load();
        Alert.alert("✓ تم الإرسال","سيتم تأكيد حجزك بعد مراجعة الإدارة");
      } else { Alert.alert("خطأ","تعذّر إرسال رقم الإيصال"); }
    } catch { Alert.alert("خطأ","تعذّر الاتصال"); }
    finally { setSubmittingPay(false); }
  }, [payModal, payRef, user, load]);

  const filtered = filter === "all" ? bookings
    : filter === "pending_payment"
      ? bookings.filter(b => b.payment_status === "pending_payment" || b.payment_status === "rejected")
      : bookings.filter(b => b.status === filter);

  const pendingCount = bookings.filter(b => b.payment_status === "pending_payment" || b.payment_status === "rejected").length;

  if (loading) return <ActivityIndicator color={ACCENT} style={{ marginTop:40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding:16 }}>
      {/* تحذير الدفع المعلّق */}
      {pendingCount > 0 && (
        <Animated.View entering={FadeIn.springify()}
          style={{ backgroundColor: GOLD+"18", borderRadius:12, padding:12, marginBottom:12,
            borderWidth:1, borderColor: GOLD+"44", flexDirection:"row", alignItems:"center", gap:10 }}>
          <Ionicons name="warning-outline" size={20} color={GOLD} />
          <Text style={{ color:GOLD, fontSize:13, fontWeight:"700", flex:1 }}>
            {pendingCount} تذكرة تنتظر إرسال إيصال الدفع
          </Text>
          <TouchableOpacity onPress={()=>setFilter("pending_payment")}>
            <Text style={{ color:GOLD, fontSize:12, fontWeight:"700", textDecorationLine:"underline" }}>عرض</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* فلاتر الحالة */}
      <View style={styles.filterRow}>
        {([
          ["all","الكل"],
          ["confirmed","مؤكدة"],
          ["pending_payment","بانتظار الدفع"],
          ["cancelled","ملغاة"],
        ] as const).map(([f,l]) => (
          <TouchableOpacity key={f} onPress={()=>setFilter(f)}
            style={[styles.filterChip, filter===f && styles.filterChipActive]}>
            <Text style={[styles.filterChipTxt, filter===f && styles.filterChipTxtActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="ticket-outline" size={64} color={ACCENT+"40"} />
          <Text style={styles.emptyTitle}>لا توجد تذاكر</Text>
          <Text style={styles.emptySub}>احجز رحلتك القادمة من تبويب "حجز تذكرة"</Text>
        </View>
      ) : filtered.map(booking => (
        <View key={booking.id}>
          <TicketCard
            booking={booking}
            onCancel={booking.payment_status !== "verified" ? ()=>handleCancel(booking) : undefined}
            onReschedule={()=>{ setRescheduleModal(booking); setNewDate(""); }}
            onShare={()=>shareTicket(booking)}
            onWhatsApp={()=>sendToWhatsApp(booking)}
          />
          {/* شريط حالة الدفع */}
          <View style={{ backgroundColor:"#0F1F35", borderRadius:12, padding:12, marginTop:-12, marginBottom:16,
            flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
            <PaymentBadge status={booking.payment_status || "pending_payment"} />
            {(booking.payment_status === "pending_payment" || booking.payment_status === "rejected") && (
              <TouchableOpacity onPress={()=>{ setPayModal(booking); setPayRef(booking.payment_ref || ""); }}
                style={{ backgroundColor:ACCENT, borderRadius:8, paddingHorizontal:12, paddingVertical:6 }}>
                <Text style={{ color:"#fff", fontSize:12, fontWeight:"700" }}>📲 أرسل الإيصال</Text>
              </TouchableOpacity>
            )}
            {booking.payment_status === "rejected" && booking.payment_rejection_reason ? (
              <Text style={{ fontSize:11, color:"#F87171", flex:1, marginStart:8 }}>
                {booking.payment_rejection_reason}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {/* مودال إرسال رقم الإيصال */}
      <Modal visible={!!payModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.smallModal, { maxWidth:360 }]}>
            <Text style={styles.smallModalTitle}>إرسال إيصال الدفع</Text>
            <Text style={styles.smallModalSub}>التذكرة: {payModal?.ticket_number}</Text>
            <Text style={{ fontSize:12, color:"#93C5FD", marginBottom:8, marginTop:4 }}>
              المبلغ: {payModal?.price} جنيه
            </Text>
            <TextInput
              style={styles.input}
              value={payRef}
              onChangeText={setPayRef}
              placeholder="رقم العملية / المرجع (مثال: TXN-12345)"
              placeholderTextColor="#4B6A8A"
              keyboardType="default"
            />
            <Text style={{ fontSize:11, color:"#64748B", marginBottom:12 }}>
              * أدخل رقم العملية من تطبيق البنك أو شركة الاتصالات
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={()=>{ setPayModal(null); setPayRef(""); }} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSubmitPayment} disabled={submittingPay}
                style={[styles.modalConfirmBtn, { opacity:submittingPay?0.6:1 }]}>
                <Text style={styles.modalConfirmTxt}>{submittingPay?"جاري الإرسال...":"تأكيد الإرسال"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* مودال التأجيل */}
      <Modal visible={!!rescheduleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.smallModal}>
            <Text style={styles.smallModalTitle}>تأجيل موعد السفر</Text>
            <Text style={styles.smallModalSub}>التذكرة: {rescheduleModal?.ticket_number}</Text>
            <TextInput style={styles.input} value={newDate} onChangeText={setNewDate}
              placeholder="التاريخ الجديد (YYYY-MM-DD)" keyboardType="numeric" maxLength={10} />
            <View style={styles.modalBtns}>
              <TouchableOpacity onPress={()=>setRescheduleModal(null)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelTxt}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReschedule} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmTxt}>تأكيد التأجيل</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════
// تبويب الشركاء + عقد الشراكة
// ═══════════════════════════════════════════════════════════════
function PartnersTab({ isAdmin }: { isAdmin: boolean }) {
  const [companies,  setCompanies]  = useState<TravelCompany[]>([]);
  const [showContract, setShowContract] = useState(false);

  useEffect(() => {
    fetchWithTimeout(`${getApiUrl()}/travel/companies`)
      .then(r => r.json())
      .then(d => setCompanies(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding:16 }}>
      {/* وكالات السفر والسياحة */}
      <AnimatedPress onPress={() => router.push("/travel-agencies" as any)}>
        <LinearGradient colors={["#0A1A2E","#1D4ED8"]} style={[styles.partnerBanner, { marginBottom:10 }]}>
          <MaterialCommunityIcons name="bus" size={32} color="#93C5FD" />
          <View style={{ flex:1, marginStart:12 }}>
            <Text style={styles.partnerBannerTitle}>وكالات السفر والسياحة</Text>
            <Text style={styles.partnerBannerSub}>دليل الوكالات المعتمدة — محلية ودولية — وسجّل وكالتك</Text>
          </View>
          <Ionicons name="arrow-back" size={20} color="#60A5FA" />
        </LinearGradient>
      </AnimatedPress>

      <LinearGradient colors={["#0C1D3A","#1E3A5F"]} style={styles.partnerBanner}>
        <MaterialCommunityIcons name="handshake" size={32} color={ACCENT2} />
        <View style={{ flex:1, marginStart:12 }}>
          <Text style={styles.partnerBannerTitle}>انضم كشريك في السفر</Text>
          <Text style={styles.partnerBannerSub}>وفّر خدمات نقل موثوقة لأهالي الحصاحيصا واكسب أكثر</Text>
        </View>
      </LinearGradient>

      {/* عقد الشراكة — حصري للمشرفين فقط */}
      {isAdmin ? (
        <AnimatedPress onPress={()=>setShowContract(true)} style={styles.contractBtn}>
          <Ionicons name="document-text-outline" size={20} color="#fff" />
          <Text style={styles.contractBtnTxt}>عرض عقد الشراكة</Text>
        </AnimatedPress>
      ) : (
        <View style={styles.contractLockedBox}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.contractLockedTxt}>
            للتعاقد والشراكة تواصل مع إدارة التطبيق{"\n"}
            <Text style={{ color: ACCENT, fontWeight:"700" }}>العقود حصرية بين المؤسسة والإدارة</Text>
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>مساحة وكالات السفر والسياحة</Text>
      <View style={styles.agencyPanel}>
        <View style={styles.agencyHeroIcon}>
          <MaterialCommunityIcons name="office-building-marker-outline" size={30} color={ACCENT2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.agencyTitle}>بوابة احترافية للوكالات</Text>
          <Text style={styles.agencySub}>استقبال الحجوزات، إدارة العروض، متابعة الاشتراكات، وتنسيق الرحلات السياحية من مكان واحد.</Text>
        </View>
      </View>
      <View style={styles.agencyGrid}>
        {[
          ["calendar-clock", "طلبات الحجز", "متابعة الطلبات الواردة"],
          ["tag-multiple-outline", "العروض السياحية", "باقات ورحلات موسمية"],
          ["account-tie-outline", "ملفات الوكالات", "بيانات الترخيص والاتصال"],
          ["credit-card-check-outline", "الاشتراكات", "تفعيل وتجديد الباقات"],
        ].map(([icon, title, sub]) => (
          <View key={title} style={styles.agencyFeatureCard}>
            <MaterialCommunityIcons name={icon as any} size={24} color={ACCENT2} />
            <Text style={styles.agencyFeatureTitle}>{title}</Text>
            <Text style={styles.agencyFeatureSub}>{sub}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>شركاؤنا الحاليون</Text>
      {companies.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="bus" size={48} color={ACCENT+"44"} />
          <Text style={styles.emptyTitle}>لا توجد شركات مسجّلة بعد</Text>
        </View>
      ) : companies.map(c => (
        <Animated.View key={c.id} entering={FadeInDown.springify()} style={styles.companyCard}>
          <View style={styles.companyCardIcon}>
            <MaterialCommunityIcons name="bus" size={24} color={ACCENT} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={styles.companyCardName}>{c.name}</Text>
            <Text style={styles.companyCardOwner}>{c.owner_name}</Text>
            <View style={styles.companyCardMeta}>
              {c.subscription_type === "commission" ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipTxt}>عمولة {c.commission_pct}%</Text>
                </View>
              ) : (
                <View style={[styles.metaChip, {backgroundColor:"#1E3A5F"}]}>
                  <Text style={styles.metaChipTxt}>{c.subscription_type === "annual" ? "اشتراك سنوي" : "اشتراك شهري"}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.companyCardActions}>
            {c.phone ? (
              <TouchableOpacity onPress={()=>Linking.openURL(`tel:${c.phone}`)} style={styles.callBtn}>
                <Ionicons name="call" size={16} color="#fff" />
              </TouchableOpacity>
            ) : null}
            {c.wa_number ? (
              <TouchableOpacity onPress={()=>Linking.openURL(`https://wa.me/${c.wa_number}`)} style={styles.waCircleBtn}>
                <MaterialCommunityIcons name="whatsapp" size={16} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      ))}

      <ContractModal visible={showContract} onClose={()=>setShowContract(false)} />
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════
// عقد الشراكة
// ═══════════════════════════════════════════════════════════════
function ContractModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const contractText = `
عقد شراكة — خدمة تذاكر السفر
تطبيق حصاحيصاوي

الأطراف:
الطرف الأول: شركة/مكتب النقل (الشريك)
الطرف الثاني: منصة حصاحيصاوي

البنود والشروط:

١. موضوع العقد
يُخوّل هذا العقد الشريكَ بتقديم خدمات النقل البري بين المدن عبر منصة حصاحيصاوي، مع عرض الرحلات وتلقّي حجوزات المسافرين مباشرةً من التطبيق.

٢. نموذج الإيرادات
يتوفر نموذجان للشراكة:
أ) العمولة: تحصل المنصة على نسبة متفق عليها (10% افتراضياً) من قيمة كل تذكرة محجوزة عبر التطبيق.
ب) الاشتراك الثابت: رسم سنوي أو شهري محدد بصرف النظر عن عدد الحجوزات.

٣. التزامات الشريك
• توفير رحلات منتظمة وفق المواعيد المُدخلة في المنصة.
• الالتزام بالأسعار المعلنة للمسافرين.
• الإبلاغ عن أي تغيير في المواعيد أو الأسعار قبل 24 ساعة.
• التحقق من هوية المسافر عند الركوب بمطابقة رقم التذكرة.
• التحلي بالأمانة واحترام المسافرين.

٤. التزامات المنصة
• الترويج لرحلات الشريك بين مستخدمي التطبيق.
• توفير نظام حجز احترافي مع تذاكر إلكترونية فاخرة.
• إرسال إشعارات للمسافرين قبل موعد الرحلة.
• تقديم تقارير شهرية عن الحجوزات والإيرادات.

٥. الإلغاء والتأجيل
يحق للمسافر إلغاء أو تأجيل تذكرته قبل موعد السفر بـ24 ساعة على الأقل. تُعاد المبالغ وفق سياسة الشريك المعلنة.

٦. مدة العقد
سنة ميلادية قابلة للتجديد التلقائي ما لم يُخطَر الطرفان برغبة في الإنهاء قبل 30 يوماً.

٧. النزاعات
تُحل أي خلافات بالتفاوض المباشر أولاً، وإن تعذّر ذلك أُحيل الأمر إلى التحكيم وفق القانون السوداني.

للانضمام أو الاستفسار:
تواصل مع فريق حصاحيصاوي عبر التطبيق أو واتساب.

—————
تطبيق حصاحيصاوي © ${new Date().getFullYear()}
`.trim();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex:1, backgroundColor:Colors.bg }}>
        <View style={styles.contractHeader}>
          <Text style={styles.contractHeaderTitle}>عقد الشراكة</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding:20 }}>
          <LinearGradient colors={["#0C1D3A","#1E3A5F"]} style={styles.contractBadge}>
            <Ionicons name="document-text" size={32} color={ACCENT2} />
            <Text style={styles.contractBadgeTitle}>عقد شراكة رسمي</Text>
            <Text style={styles.contractBadgeSub}>تطبيق حصاحيصاوي — خدمة السفريات</Text>
          </LinearGradient>
          <Text style={styles.contractBody}>{contractText}</Text>
          <AnimatedPress onPress={()=>{
            Share.share({ message: contractText, title:"عقد شراكة حصاحيصاوي" });
          }} style={styles.shareContractBtn}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.shareContractBtnTxt}>مشاركة العقد</Text>
          </AnimatedPress>
                <OrgInviteCard />
</ScrollView>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// دوال مساعدة
// ═══════════════════════════════════════════════════════════════
function shareTicket(booking: TravelBooking) {
  const dateStr = new Date(booking.travel_date).toLocaleDateString("ar-SD");
  const msg = `
🚌 تذكرة سفر — حصاحيصاوي

🏙️ من: ${booking.from_city}
🏙️ إلى: ${booking.to_city}
📅 تاريخ: ${dateStr}
⏰ وقت المغادرة: ${booking.departure_time || "—"}
👤 الراكب: ${booking.passenger_name}
💺 المقعد: ${booking.seat_number || "—"}
💰 السعر: ${Number(booking.price).toLocaleString("ar")} ج.س
🏷️ رقم التذكرة: ${booking.ticket_number}
🔖 رمز الحجز: ${booking.booking_ref}
  `.trim();
  Share.share({ message: msg, title:"تذكرة سفر" });
}

function sendToWhatsApp(booking: TravelBooking) {
  const dateStr = new Date(booking.travel_date).toLocaleDateString("ar-SD");
  const msg = `
🚌 تذكرة سفر — حصاحيصاوي
━━━━━━━━━━━━━━━━━
من: ${booking.from_city} ← إلى: ${booking.to_city}
تاريخ: ${dateStr} | ${booking.departure_time || ""}
الراكب: ${booking.passenger_name}
مقعد: ${booking.seat_number || "—"} | سعر: ${Number(booking.price).toLocaleString("ar")} ج.س
رقم التذكرة: ${booking.ticket_number}
━━━━━━━━━━━━━━━━━
تم الحجز عبر تطبيق حصاحيصاوي
  `.trim();
  const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
  Linking.canOpenURL(url).then(supported => {
    if (supported) Linking.openURL(url);
    else Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  });
}

// ═══════════════════════════════════════════════════════════════
// الشاشة الرئيسية
// ═══════════════════════════════════════════════════════════════
export default function TravelScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"book"|"tickets"|"partners">("book");
  const [myBookingsCount, setMyBookingsCount] = useState(0);
  const planeX = useSharedValue<number>(0);

  useEffect(() => {
    planeX.value = withRepeat(
      withTiming(SCREEN_W - 80, { duration:3000, easing:Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, [planeX]);

  const planeStyle = useAnimatedStyle(() => ({
    transform:[{ translateX: planeX.value }],
  }));

  return (
    <View style={styles.container}>
      {/* رأس الصفحة */}
      <ModernHeader
        title="السفريات"
        subtitle="حجوزات موثوقة عبر شركات ووكالات السفر"
        icon="bus-outline"
        gradient={Colors.gradients.gold}
      >
        {/* حافلة متحركة */}
        <View style={styles.planeLine}>
          <Animated.View style={[styles.movingPlane, planeStyle]}>
            <MaterialCommunityIcons name="bus" size={18} color="rgba(255,255,255,0.55)" />
          </Animated.View>
        </View>
      </ModernHeader>

      {/* تبويبات */}
      <View style={styles.tabBar}>
        {([
          { key:"book",     label:"حجز تذكرة",  icon:"bus-outline" },
          { key:"tickets",  label:"تذاكري",      icon:"ticket-outline" },
          { key:"partners", label:"الشركاء",     icon:"handshake-outline" },
        ] as const).map(tab => (
          <TouchableOpacity key={tab.key} onPress={()=>{ Haptics.selectionAsync(); setActiveTab(tab.key); }}
            style={[styles.tabItem, activeTab===tab.key && styles.tabItemActive]}>
            <MaterialCommunityIcons
              name={tab.icon as any}
              size={18}
              color={activeTab===tab.key ? Colors.accent : Colors.textMuted}
            />
            <Text style={[styles.tabLabel, activeTab===tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* المحتوى */}
      <View style={{ flex:1 }}>
        {activeTab === "book" && (
          <GuestGate title="سجّل دخولك لحجز تذاكر السفر">
            <BookingForm user={user} onBooked={()=>setMyBookingsCount(n=>n+1)} />
          </GuestGate>
        )}
        {activeTab === "tickets" && (
          <GuestGate title="سجّل دخولك لعرض تذاكرك">
            <MyTickets user={user} />
          </GuestGate>
        )}
        {activeTab === "partners" && <PartnersTab isAdmin={user?.role === "admin"} />}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// الأنماط
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container:       { flex:1, backgroundColor:Colors.bg },
  planeLine:       { height:24, overflow:"hidden", marginTop:2 },
  movingPlane:     { position:"absolute", top:2 },

  tabBar:          { flexDirection:"row", backgroundColor:Colors.cardBg, borderBottomWidth:1, borderColor:Colors.borderSubtle },
  tabItem:         { flex:1, alignItems:"center", paddingVertical:10, gap:3 },
  tabItemActive:   { borderBottomWidth:2, borderBottomColor:Colors.accent },
  tabLabel:        { fontSize:11, color:Colors.textMuted, fontWeight:"500" },
  tabLabelActive:  { color:Colors.accent, fontWeight:"700" },

  sectionTitle:    { fontSize:16, fontWeight:"700", color:Colors.text, marginBottom:12, marginTop:8 },

  cityPickerRow:   { flexDirection:"row", alignItems:"center", gap:8, marginBottom:12 },
  cityPickerBtn:   { flex:1, flexDirection:"row", alignItems:"center", backgroundColor:Colors.cardBg, borderRadius:Colors.radius.md, padding:12, gap:6, borderWidth:1, borderColor:Colors.borderSubtle },
  cityPickerTxt:   { flex:1, fontSize:13, color:Colors.text },
  swapBtn:         { width:36, height:36, borderRadius:18, backgroundColor:ACCENT+"22", justifyContent:"center", alignItems:"center" },
  searchBtn:       { flexDirection:"row", backgroundColor:Colors.primary, borderRadius:Colors.radius.md, padding:14, justifyContent:"center", alignItems:"center", gap:8, marginBottom:20 },
  searchBtnTxt:    { color:"#fff", fontWeight:"700", fontSize:15 },

  destChip:        { backgroundColor:Colors.cardBg, borderRadius:20, paddingHorizontal:14, paddingVertical:8, marginEnd:8, borderWidth:1, borderColor:ACCENT+"44" },
  destChipTxt:     { color:Colors.text, fontSize:13 },

  infoCard:        { flexDirection:"row", borderRadius:16, padding:16, alignItems:"center", marginTop:8 },
  infoCardTitle:   { color:"#fff", fontWeight:"700", fontSize:14, marginBottom:4 },
  infoCardSub:     { color:"#93C5FD", fontSize:12, lineHeight:18 },

  fieldLabel:      { fontSize:13, color:Colors.textMuted, marginBottom:4, marginTop:12 },
  input:           { backgroundColor:Colors.cardBg, borderRadius:10, padding:12, color:Colors.text, fontSize:14, borderWidth:1, borderColor:Colors.borderSubtle },
  dateChipGrid:    { flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:10 },
  dateChip:        { minWidth:"30%", flexGrow:1, backgroundColor:Colors.cardBg, borderRadius:Colors.radius.md, paddingVertical:10, paddingHorizontal:10, borderWidth:1, borderColor:Colors.borderSubtle, alignItems:"center", gap:3 },
  dateChipActive:  { backgroundColor:Colors.primary, borderColor:Colors.primary },
  dateChipText:    { color:Colors.text, fontSize:12, fontWeight:"700" },
  dateChipSub:     { color:Colors.textMuted, fontSize:10, fontWeight:"600" },
  dateChipTextActive:{ color:"#fff" },

  bookBtn:         { flexDirection:"row", backgroundColor:Colors.primary, borderRadius:Colors.radius.lg, padding:15, justifyContent:"center", alignItems:"center", gap:10, marginTop:20 },
  bookBtnText:     { color:"#fff", fontWeight:"700", fontSize:16 },

  sectionHeader:   { flexDirection:"row", alignItems:"center", gap:8, marginBottom:16 },
  backBtn:         { width:36, height:36, borderRadius:Colors.radius.pill, backgroundColor:Colors.cardBg, justifyContent:"center", alignItems:"center" },

  routeCard:       { backgroundColor:Colors.cardBg, borderRadius:Colors.radius.lg, padding:14, marginBottom:10, flexDirection:"row", borderWidth:1, borderColor:Colors.borderSubtle, ...Colors.shadow.card },
  routeCardSelected:{ borderColor:ACCENT, borderWidth:2 },
  routeCardLeft:   { flex:1 },
  routeCardRight:  { alignItems:"flex-end", justifyContent:"space-between" },
  routeCardCompany:{ fontSize:14, fontWeight:"700", color:Colors.text, marginBottom:4 },
  routeCardCities: { flexDirection:"row", alignItems:"center", gap:6, marginBottom:4 },
  routeCardCity:   { fontSize:13, color:Colors.textSecondary },
  routeCardTime:   { flexDirection:"row", alignItems:"center", gap:4 },
  routeCardTimeTxt:{ fontSize:12, color:Colors.textMuted },
  routeCardPrice:  { fontSize:20, fontWeight:"800", color:GOLD },
  routeCardCurrency:{ fontSize:11, color:Colors.textMuted },
  selectBtn:       { backgroundColor:ACCENT, borderRadius:8, paddingHorizontal:10, paddingVertical:4 },
  selectBtnTxt:    { color:"#fff", fontSize:12, fontWeight:"700" },

  confirmCard:     { borderRadius:Colors.radius.lg, padding:20, marginBottom:16, alignItems:"center" },
  confirmRoute:    { flexDirection:"row", alignItems:"center", gap:12, marginBottom:8 },
  confirmCity:     { fontSize:18, fontWeight:"700", color:"#fff" },
  confirmCompany:  { fontSize:14, color:"#93C5FD", marginBottom:4 },
  confirmCompanyBadge:{ flexDirection:"row-reverse", alignItems:"center", gap:6, backgroundColor:"#ffffff12", borderWidth:1, borderColor:ACCENT2+"35", paddingHorizontal:12, paddingVertical:6, borderRadius:999, marginBottom:6 },
  confirmCompanyBadgeText:{ fontSize:14, color:"#E0F2FE", fontWeight:"800" },
  confirmTime:     { fontSize:13, color:"#CBD5E1" },
  confirmPrice:    { fontSize:24, fontWeight:"800", color:GOLD, marginTop:8 },

  successHeader:   { marginBottom:16 },
  successBadge:    { borderRadius:20, padding:24, alignItems:"center" },
  successTitle:    { fontSize:22, fontWeight:"800", color:"#fff", marginTop:12 },
  successSub:      { fontSize:14, color:"#6EE7B7" },
  newBookingBtn:   { backgroundColor:Colors.primary, borderRadius:Colors.radius.md, padding:14, alignItems:"center", marginTop:16 },
  newBookingBtnText:{ color:"#fff", fontWeight:"700", fontSize:15 },

  // بطاقة التذكرة
  ticketWrap:      { marginBottom:20 },
  ticketCard:      { borderRadius:20, overflow:"hidden", padding:0 },
  ticketHeader:    { flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:16, paddingBottom:8 },
  ticketHeaderLeft:{ flexDirection:"row", alignItems:"center", gap:10 },
  airlineLogoWrap: { width:36, height:36, borderRadius:18, backgroundColor:"#ffffff15", justifyContent:"center", alignItems:"center" },
  ticketAirline:   { fontSize:14, fontWeight:"700", color:"#fff" },
  ticketBookingRef:{ fontSize:11, color:"#93C5FD" },
  statusBadge:     { borderRadius:8, paddingHorizontal:8, paddingVertical:3 },
  statusText:      { fontSize:11, fontWeight:"700" },

  routeRow:        { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:8 },
  cityBlock:       { width:80, alignItems:"flex-end" },
  cityCode:        { fontSize:28, fontWeight:"900", color:"#fff", letterSpacing:1 },
  cityName:        { fontSize:11, color:"#93C5FD", marginTop:2, maxWidth:75, textAlign:"right" },
  routeCenter:     { flex:1, flexDirection:"row", alignItems:"center" },
  routeLine:       { flex:1, height:1, backgroundColor:"#ffffff30" },
  planIcon:        { marginHorizontal:4 },

  tearLine:        { flexDirection:"row", alignItems:"center", marginVertical:8 },
  tearCircleLeft:  { width:20, height:20, borderRadius:10, backgroundColor:Colors.bg, marginStart:-10 },
  tearCircleRight: { width:20, height:20, borderRadius:10, backgroundColor:Colors.bg, marginEnd:-10 },
  dashedRow:       { flex:1, flexDirection:"row", justifyContent:"space-between", paddingHorizontal:4 },
  dashSegment:     { width:6, height:1, backgroundColor:"#ffffff30" },

  ticketDetails:   { paddingHorizontal:16, paddingVertical:8 },
  detailRow:       { flexDirection:"row", alignItems:"center", gap:8, marginBottom:6 },
  detailLabel:     { fontSize:12, color:"#93C5FD", width:90 },
  detailValue:     { fontSize:13, color:"#fff", fontWeight:"600", flex:1 },

  qrSection:       { flexDirection:"row", alignItems:"center", padding:16, gap:12 },
  qrBox:           { width:64, height:64, backgroundColor:"#fff", borderRadius:8, justifyContent:"center", alignItems:"center", padding:4 },
  qrGrid:          { width:56, height:56, flexDirection:"row", flexWrap:"wrap" },
  qrCell:          { width:8, height:8 },
  qrFilled:        { backgroundColor:"#000" },
  qrEmpty:         { backgroundColor:"transparent" },
  ticketNumberBlock:{ flex:1 },
  ticketNumberLabel:{ fontSize:11, color:"#93C5FD" },
  ticketNumberValue:{ fontSize:13, color:"#fff", fontWeight:"700", marginTop:2 },

  ticketActions:   { flexDirection:"row", padding:12, gap:6, borderTopWidth:1, borderColor:"#ffffff20" },
  ticketBtn:       { flex:1, flexDirection:"row", justifyContent:"center", alignItems:"center", paddingVertical:8, borderRadius:8, gap:4 },
  ticketBtnText:   { fontSize:11, color:"#fff", fontWeight:"600" },
  shareBtn:        { backgroundColor:"#0369A1" },
  waBtn:           { backgroundColor:"#16A34A" },
  rescheduleBtn:   { backgroundColor:"#D97706" },
  cancelBtn:       { backgroundColor:"#DC2626" },

  // قوائم
  filterRow:       { flexDirection:"row", gap:8, marginBottom:16 },
  filterChip:      { flex:1, paddingVertical:7, borderRadius:Colors.radius.md, alignItems:"center", backgroundColor:Colors.cardBg, borderWidth:1, borderColor:Colors.borderSubtle },
  filterChipActive:{ backgroundColor:Colors.primary, borderColor:Colors.primary },
  filterChipTxt:   { fontSize:13, color:Colors.textMuted, fontWeight:"600" },
  filterChipTxtActive:{ color:Colors.white },

  emptyBox:        { alignItems:"center", paddingVertical:40, gap:8 },
  emptyTitle:      { fontSize:16, fontWeight:"700", color:Colors.textMuted },
  emptySub:        { fontSize:13, color:Colors.textMuted, textAlign:"center", maxWidth:260 },

  // الشركاء
  agencyPanel:      { flexDirection:"row-reverse", alignItems:"center", gap:12, backgroundColor:Colors.primaryDeep, borderRadius:Colors.radius.lg, borderWidth:1, borderColor:Colors.borderGlow, padding:16, marginBottom:12 },
  agencyHeroIcon:   { width:56, height:56, borderRadius:Colors.radius.md, backgroundColor:Colors.primaryGlow, borderWidth:1, borderColor:Colors.borderGlow, justifyContent:"center", alignItems:"center" },
  agencyTitle:      { color:"#fff", fontSize:16, fontWeight:"900", textAlign:"right", marginBottom:4 },
  agencySub:        { color:"#93C5FD", fontSize:12, lineHeight:19, textAlign:"right" },
  agencyGrid:       { flexDirection:"row-reverse", flexWrap:"wrap", gap:10, marginBottom:18 },
  agencyFeatureCard:{ width:"48%", backgroundColor:Colors.cardBg, borderRadius:Colors.radius.lg, padding:14, borderWidth:1, borderColor:Colors.borderSubtle, alignItems:"flex-end", gap:6, ...Colors.shadow.card },
  agencyFeatureTitle:{ color:Colors.text, fontSize:13, fontWeight:"800", textAlign:"right" },
  agencyFeatureSub: { color:Colors.textMuted, fontSize:11, lineHeight:17, textAlign:"right" },

  partnerBanner:   { borderRadius:Colors.radius.lg, padding:16, flexDirection:"row", alignItems:"center", marginBottom:16 },
  partnerBannerTitle:{ color:"#fff", fontWeight:"700", fontSize:15, marginBottom:4 },
  partnerBannerSub:{ color:"#93C5FD", fontSize:12, lineHeight:18 },
  contractBtn:       { flexDirection:"row", backgroundColor:Colors.primaryDeep, borderRadius:Colors.radius.md, padding:13, justifyContent:"center", alignItems:"center", gap:8, marginBottom:20 },
  contractBtnTxt:    { color:"#fff", fontWeight:"700", fontSize:14 },
  contractLockedBox: { flexDirection:"row-reverse", alignItems:"flex-start", gap:10, backgroundColor:Colors.cardBg, borderRadius:Colors.radius.md, padding:14, marginBottom:20, borderWidth:1, borderColor:Colors.borderSubtle },
  contractLockedTxt: { flex:1, fontSize:13, color:Colors.textSecondary, textAlign:"right" as const, lineHeight:20 },

  companyCard:     { flexDirection:"row", backgroundColor:Colors.cardBg, borderRadius:Colors.radius.lg, padding:14, marginBottom:10, alignItems:"center", gap:12, borderWidth:1, borderColor:Colors.borderSubtle, ...Colors.shadow.card },
  companyCardIcon: { width:44, height:44, borderRadius:22, backgroundColor:ACCENT+"20", justifyContent:"center", alignItems:"center" },
  companyCardName: { fontSize:15, fontWeight:"700", color:Colors.text },
  companyCardOwner:{ fontSize:12, color:Colors.textMuted, marginTop:2 },
  companyCardMeta: { flexDirection:"row", gap:6, marginTop:6 },
  metaChip:        { backgroundColor:"#1E3A5F", borderRadius:6, paddingHorizontal:8, paddingVertical:3 },
  metaChipTxt:     { fontSize:11, color:ACCENT2 },
  companyCardActions:{ gap:6 },
  callBtn:         { width:32, height:32, borderRadius:16, backgroundColor:"#16A34A", justifyContent:"center", alignItems:"center" },
  waCircleBtn:     { width:32, height:32, borderRadius:16, backgroundColor:"#16A34A", justifyContent:"center", alignItems:"center" },

  // عقد الشراكة
  contractHeader:  { flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:16, borderBottomWidth:1, borderColor:Colors.borderSubtle },
  contractHeaderTitle:{ fontSize:18, fontWeight:"700", color:Colors.text },
  contractBadge:   { borderRadius:Colors.radius.lg, padding:20, alignItems:"center", marginBottom:16 },
  contractBadgeTitle:{ color:"#fff", fontWeight:"700", fontSize:18, marginTop:8 },
  contractBadgeSub:{ color:"#93C5FD", fontSize:13, marginTop:4 },
  contractBody:    { fontSize:13, color:Colors.textSecondary, lineHeight:22, textAlign:"right" },
  shareContractBtn:{ flexDirection:"row", backgroundColor:Colors.primary, borderRadius:Colors.radius.md, padding:13, justifyContent:"center", alignItems:"center", gap:8, marginTop:20 },
  shareContractBtnTxt:{ color:"#fff", fontWeight:"700", fontSize:14 },

  // موديالات
  modalOverlay:    { flex:1, backgroundColor:"#00000088", justifyContent:"flex-end" },
  cityModal:       { backgroundColor:Colors.bg, borderTopLeftRadius:Colors.radius.xl, borderTopRightRadius:Colors.radius.xl, maxHeight:"75%", paddingBottom:32 },
  cityModalHeader: { flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:16, borderBottomWidth:1, borderColor:Colors.borderSubtle },
  cityModalTitle:  { fontSize:16, fontWeight:"700", color:Colors.text },
  cityOption:      { flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:14, borderBottomWidth:1, borderColor:Colors.dividerSoft },
  cityOptionTxt:   { fontSize:15, color:Colors.text },

  smallModal:      { backgroundColor:Colors.bg, borderTopLeftRadius:Colors.radius.xl, borderTopRightRadius:Colors.radius.xl, padding:24 },
  smallModalTitle: { fontSize:16, fontWeight:"700", color:Colors.text, marginBottom:4 },
  smallModalSub:   { fontSize:12, color:Colors.textMuted, marginBottom:16 },
  modalBtns:       { flexDirection:"row", gap:10, marginTop:16 },
  modalCancelBtn:  { flex:1, backgroundColor:Colors.cardBg, borderRadius:10, padding:12, alignItems:"center" },
  modalCancelTxt:  { color:Colors.textMuted, fontWeight:"600" },
  modalConfirmBtn: { flex:1, backgroundColor:ACCENT, borderRadius:10, padding:12, alignItems:"center" },
  modalConfirmTxt: { color:"#fff", fontWeight:"700" },
});
