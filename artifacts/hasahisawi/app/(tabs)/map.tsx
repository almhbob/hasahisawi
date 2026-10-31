import { withRTLScreen } from "@/components/RTLScope";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Linking, Alert, Platform, ScrollView,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { LEAFLET_JS, LEAFLET_CSS } from "@/lib/leaflet-bundle";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader from "@/components/ui/ModernHeader";

async function safeCall(number: string) {
  const url = `tel:${number.replace(/\s+/g, "")}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) { Alert.alert("تنبيه", "لا يمكن إجراء مكالمة على هذا الجهاز"); return; }
    await Linking.openURL(url);
  } catch {
    Alert.alert("خطأ", "تعذّر الاتصال — تحقق من الرقم وأعد المحاولة");
  }
}


// ── الألوان ──────────────────────────────────────────────────────────────────
const BG     = Colors.bg;
const CYBER  = Colors.primary;
const CARD   = Colors.cardBg;
const BORDER = Colors.border;
const MUTED  = Colors.textMuted;

// ── أنواع الفئات ─────────────────────────────────────────────────────────────
type Category = {
  id: string;
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const CATEGORIES: Category[] = [
  { id: "all",      label: "الكل",     color: CYBER,      icon: "apps-outline"        },
  { id: "medical",  label: "طبي",      color: "#E74C6F",  icon: "medkit-outline"      },
  { id: "school",   label: "مدارس",    color: "#3B82F6",  icon: "school-outline"      },
  { id: "market",   label: "سوق",      color: "#F59E0B",  icon: "storefront-outline"  },
  { id: "mosque",   label: "مساجد",    color: "#10B981",  icon: "moon-outline"        },
  { id: "landmark", label: "معالم",    color: "#D4AF37",  icon: "star-outline"        },
  { id: "pharmacy", label: "صيدليات",  color: "#2F8A8A",  icon: "medical-outline"     },
  { id: "gov",      label: "محلية",    color: "#1F5C8A",  icon: "business-outline"    },
  { id: "bank",     label: "بنوك",     color: "#1F5C8A",  icon: "card-outline"        },
  { id: "sports",   label: "رياضة",    color: "#EF4444",  icon: "football-outline"    },
  { id: "culture",  label: "ثقافة",    color: "#3B78A6",  icon: "color-palette-outline"},
  { id: "gas",      label: "وقود",     color: "#F97316",  icon: "car-outline"         },
];

type Place = {
  id: number; name: string; category: string; address?: string;
  phone?: string; lat: number; lng: number; icon: string; color: string;
};

// ── توليد HTML خريطة Leaflet ─────────────────────────────────────────────────
// مركز الحصاحيصا الحقيقي (كان 14.6839, 33.3833 — شرق النيل قرب رفاعة)
const CITY_CENTER = { lat: 14.7406, lng: 33.2955 };

function buildMapHtml(places: Place[], userLat?: number, userLng?: number, dark = false): string {
  // JSON داخل <script>: نمنع أي "</script>" في أسماء الأماكن من كسر الصفحة
  const safe = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  const placesJson = safe(places);
  const userJson   = safe(userLat != null ? { lat: userLat, lng: userLng } : null);
  const centerJson = safe(CITY_CENTER);
  const ui = dark
    ? { bg: "#0D1613", card: "#15211C", border: "rgba(255,255,255,0.12)", text: "#E9F2EE", muted: "#93A69D" }
    : { bg: "#EEF3F0", card: "#FFFFFF", border: "#E3EAE6", text: "#1A2C25", muted: "#5E6F68" };

  return `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<script>${LEAFLET_JS}</script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #map { width:100%; height:100%; background:${ui.bg}; }
  .leaflet-popup-content-wrapper {
    background:${ui.card}; border:1px solid ${ui.border};
    border-radius:14px; color:${ui.text}; font-family:Cairo,Arial,sans-serif;
    box-shadow:0 4px 24px rgba(0,0,0,0.25);
  }
  .leaflet-popup-tip { background:${ui.card}; }
  .leaflet-popup-content { margin:12px 14px; min-width:160px; text-align:right; }
  .popup-name { font-size:15px; font-weight:700; color:${ui.text}; margin-bottom:4px; }
  .popup-addr { font-size:13px; color:${ui.muted}; margin-bottom:8px; }
  .popup-call {
    display:inline-block; background:#00966A1F; border:1px solid #00966A55;
    color:#00966A; padding:6px 12px; border-radius:8px; font-size:14px;
    cursor:pointer; text-decoration:none; margin-top:2px;
  }
  .leaflet-control-attribution { font-size:9px; }
  ${dark ? ".leaflet-tile { filter: invert(1) hue-rotate(180deg) brightness(0.85) saturate(0.7); }" : ""}
</style>
</head>
<body>
<div id="map"></div>
<script>
  var places = ${placesJson};
  var user   = ${userJson};
  var center = ${centerJson};

  // رسالة للتطبيق: WebView على الهاتف، أو الصفحة الأم على الويب
  function send(msg) {
    var data = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
    else if (window.parent && window.parent !== window) window.parent.postMessage(data, '*');
  }

  var map = L.map('map', { center: [center.lat, center.lng], zoom: 14, zoomControl: true });

  // الخرائط: OpenStreetMap، ومع أي فشل في التحميل ننتقل تلقائياً إلى CARTO
  var primary = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  });
  var fallback = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap © CARTO',
  });
  var failures = 0, switched = false;
  primary.on('tileerror', function() {
    failures++;
    if (!switched && failures >= 3) { switched = true; map.removeLayer(primary); fallback.addTo(map); }
  });
  primary.addTo(map);

  function makeIcon(color) {
    return L.divIcon({
      className: '',
      html: '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:' + color + ';border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);transform:rotate(-45deg)"></div>',
      iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -32],
    });
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // زر الاتصال: نحفظ الرقم في data-phone ونلتقط الضغط بمستمع واحد (بدون أكواد داخل النص)
  document.addEventListener('click', function(e) {
    var el = e.target && e.target.closest ? e.target.closest('.popup-call') : null;
    if (el) { e.preventDefault(); send({ type: 'call', phone: el.getAttribute('data-phone') }); }
  });

  function popupHtml(p) {
    var h = '<div class="popup-name">' + esc(p.name) + '</div>';
    if (p.address) h += '<div class="popup-addr">' + esc(p.address) + '</div>';
    if (p.phone) h += '<a class="popup-call" href="#" data-phone="' + esc(p.phone) + '">📞 ' + esc(p.phone) + '</a>';
    return h;
  }

  var layer = L.layerGroup().addTo(map);
  function draw(list) {
    layer.clearLayers();
    list.forEach(function(p) {
      if (typeof p.lat !== 'number' && typeof p.lat !== 'string') return;
      L.marker([+p.lat, +p.lng], { icon: makeIcon(p.color || '#00966A') }).addTo(layer).bindPopup(popupHtml(p), { maxWidth: 240 });
    });
  }
  draw(places);

  if (user) {
    var userIcon = L.divIcon({
      className: '',
      html: '<div style="width:20px;height:20px;border-radius:50%;background:#1D9BF0;border:3px solid #fff;box-shadow:0 0 0 6px rgba(29,155,240,0.25)"></div>',
      iconSize: [20, 20], iconAnchor: [10, 10],
    });
    L.marker([user.lat, user.lng], { icon: userIcon }).addTo(map).bindPopup('<div class="popup-name">موقعك الحالي</div>');
  }

  window.filterCategory = function(cat) {
    var filtered = cat === 'all' ? places : places.filter(function(p) { return p.category === cat; });
    draw(filtered);
    if (filtered.length > 0) {
      var bounds = L.latLngBounds(filtered.map(function(p) { return [+p.lat, +p.lng]; }));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  };

  window.goToUser = function() {
    if (user) map.setView([user.lat, user.lng], 17);
  };

  // أوامر من التطبيق على الويب (iframe)
  window.addEventListener('message', function(e) {
    try {
      var m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (m && m.cmd === 'filter') window.filterCategory(m.cat);
      if (m && m.cmd === 'user') window.goToUser();
    } catch (err) {}
  });
  send({ type: 'ready' });
</script>
</body>
</html>`;
}

// ── iframe للويب (بديل WebView) ──────────────────────────────────────────────
function WebMapFrame({ html, frameRef }: { html: string; frameRef: React.MutableRefObject<any> }) {
  return React.createElement("div", {
    style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  }, React.createElement("iframe", {
    ref: frameRef,
    srcDoc: html,
    style: { width: "100%", height: "100%", border: "none", background: BG, display: "block" },
    title: "خريطة المدينة",
    allow: "geolocation",
  }));
}

// ── الشاشة الرئيسية ──────────────────────────────────────────────────────────
function MapScreen() {
  const insets    = useSafeAreaInsets();
  const webRef    = useRef<WebView>(null);
  const frameRef  = useRef<any>(null);
  const [places,  setPlaces]  = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState("all");
  const [userLoc, setUserLoc]     = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected]   = useState<Place | null>(null);
  const [mapReady, setMapReady]   = useState(false);

  // جلب الأماكن
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    // مهلة 12 ثانية، ونقبل قائمة فقط (رد خطأ من الخادم كان يُحفظ كأماكن فيتعطل العرض)
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    fetch(`${getApiUrl()}/api/map/places`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : []))
      .then(data => {
        if (!active) return;
        const list = Array.isArray(data) ? data.filter((p: any) => Number.isFinite(+p?.lat) && Number.isFinite(+p?.lng)) : [];
        setPlaces(list);
      })
      .catch(() => {})
      .finally(() => { clearTimeout(tid); if (active) setLoading(false); });

    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === "granted") {
          return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
      })
      .then(loc => {
        if (active && loc) {
          setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, []));

  // تصفية الخريطة عند تغيير الفئة
  useEffect(() => {
    if (!mapReady) return;
    if (Platform.OS === "web") {
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ cmd: "filter", cat: activeCat }), "*");
    } else {
      webRef.current?.injectJavaScript(`window.filterCategory(${JSON.stringify(activeCat)}); true;`);
    }
  }, [activeCat, mapReady]);

  // على الويب: رسائل الخريطة تصل عبر postMessage من الـ iframe
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onMsg = (e: MessageEvent) => {
      if (frameRef.current && e.source !== frameRef.current.contentWindow) return;
      handleMsg({ nativeEvent: { data: e.data } });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const handleMsg = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "ready") { setMapReady(true); return; }
      if (msg.type === "call" && msg.phone) {
        Alert.alert("اتصال", `هل تريد الاتصال بـ ${msg.phone}؟`, [
          { text: "إلغاء", style: "cancel" },
          { text: "اتصال", onPress: () => safeCall(msg.phone) },
        ]);
      }
    } catch {}
  }, []);

  const goToUser = () => {
    if (!userLoc) {
      Alert.alert("الموقع", "لم يتم تحديد موقعك بعد. تأكد من تفعيل خدمة الموقع.");
      return;
    }
    if (Platform.OS === "web") frameRef.current?.contentWindow?.postMessage(JSON.stringify({ cmd: "user" }), "*");
    else webRef.current?.injectJavaScript("window.goToUser(); true;");
  };

  const filteredCount = activeCat === "all"
    ? places.length
    : places.filter(p => p.category === activeCat).length;

  const mapHtml = React.useMemo(
    () => buildMapHtml(places, userLoc?.lat, userLoc?.lng, Colors.isDark),
    [places, userLoc?.lat, userLoc?.lng],
  );

  return (
    <View style={s.root}>
      {/* Header */}
      <ModernHeader
        title="خريطة المدينة"
        icon="map"
        rightSlot={
          <View style={s.headerRight}>
            <Text style={s.placeCount}>{filteredCount} مكان</Text>
            <TouchableOpacity style={s.locBtn} onPress={goToUser}>
              <Ionicons name="locate" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Filter chips */}
      <View style={s.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[s.chip, activeCat === cat.id && { backgroundColor: cat.color + "22", borderColor: cat.color }]}
              onPress={() => setActiveCat(cat.id)}
              activeOpacity={0.75}
            >
              <Ionicons name={cat.icon} size={14} color={activeCat === cat.id ? cat.color : MUTED} />
              <Text style={[s.chipTxt, activeCat === cat.id && { color: cat.color }]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Map */}
      <View style={s.mapWrap}>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={CYBER} size="large" />
            <Text style={s.loadTxt}>تحميل الخريطة…</Text>
          </View>
        ) : Platform.OS === "web" ? (
          <WebMapFrame html={mapHtml} frameRef={frameRef} />
        ) : (
          <WebView
            ref={webRef}
            source={{ html: mapHtml, baseUrl: getApiUrl() }}
            style={s.webview}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            startInLoadingState
            onLoad={() => setMapReady(true)}
            setSupportMultipleWindows={false}
            onMessage={handleMsg}
            renderLoading={() => (
              <View style={[s.center, StyleSheet.absoluteFillObject, { backgroundColor: BG }]}>
                <ActivityIndicator color={CYBER} size="large" />
              </View>
            )}
          />
        )}
      </View>

      {/* Legend bottom bar */}
      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={[s.legend, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={s.legendTitle}>دليل الألوان</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.legendScroll}>
          {CATEGORIES.filter(c => c.id !== "all").map(cat => (
            <View key={cat.id} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: cat.color }]} />
              <Text style={s.legendTxt}>{cat.label}</Text>
            </View>
          ))}
                <OrgInviteCard />
</ScrollView>
      </Animated.View>
    </View>
  );
}

// ── الأنماط ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  headerRight:  { flexDirection: "row", alignItems: "center", gap: 10 },
  placeCount:   { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.85)" },
  locBtn:       { width: 36, height: 36, borderRadius: Colors.radius.pill, backgroundColor: "rgba(255,255,255,0.18)",
                  alignItems: "center", justifyContent: "center" },
  filterWrap:   { borderBottomWidth: 1, borderBottomColor: BORDER },
  filterScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip:         { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12,
                  paddingVertical: 6, borderRadius: Colors.radius.pill, borderWidth: 1, borderColor: BORDER,
                  backgroundColor: CARD },
  chipTxt:      { fontFamily: "Cairo_500Medium", fontSize: 13, color: MUTED },
  mapWrap:      { flex: 1, position: "relative" as any },
  webview:      { flex: 1, backgroundColor: BG },
  center:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadTxt:      { fontFamily: "Cairo_400Regular", fontSize: 14, color: MUTED },
  legend:       { backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8,
                  borderTopLeftRadius: Colors.radius.lg, borderTopRightRadius: Colors.radius.lg, ...Colors.shadow.card },
  legendTitle:  { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: MUTED,
                  paddingHorizontal: 16, marginBottom: 6 },
  legendScroll: { paddingHorizontal: 12, gap: 10 },
  legendItem:   { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot:    { width: 10, height: 10, borderRadius: 5 },
  legendTxt:    { fontFamily: "Cairo_400Regular", fontSize: 13, color: MUTED },
});

export default withRTLScreen(MapScreen);
