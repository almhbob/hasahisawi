import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Linking, Alert, Platform, ScrollView,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { LEAFLET_JS, LEAFLET_CSS } from "@/lib/leaflet-bundle";

// ── الألوان ──────────────────────────────────────────────────────────────────
const BG     = Colors.bg   ?? "#0A1A10";
const CYBER  = Colors.cyber ?? "#3EFF9C";
const CARD   = "#0F2318";
const BORDER = "#1A3A22";
const MUTED  = Colors.textMuted ?? "#4A7A5A";

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
  { id: "pharmacy", label: "صيدليات",  color: "#06B6D4",  icon: "medical-outline"     },
  { id: "gov",      label: "حكومي",    color: "#8B5CF6",  icon: "business-outline"    },
  { id: "bank",     label: "بنوك",     color: "#6366F1",  icon: "card-outline"        },
  { id: "sports",   label: "رياضة",    color: "#EF4444",  icon: "football-outline"    },
  { id: "culture",  label: "ثقافة",    color: "#A855F7",  icon: "color-palette-outline"},
  { id: "gas",      label: "وقود",     color: "#F97316",  icon: "car-outline"         },
];

type Place = {
  id: number; name: string; category: string; address?: string;
  phone?: string; lat: number; lng: number; icon: string; color: string;
};

// ── توليد HTML خريطة Leaflet ─────────────────────────────────────────────────
function buildMapHtml(places: Place[], userLat?: number, userLng?: number): string {
  const placesJson = JSON.stringify(places);
  const userJson   = JSON.stringify(userLat != null ? { lat: userLat, lng: userLng } : null);

  return `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
<script>${LEAFLET_JS}</script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #map { width:100%; height:100%; background:#0A1A10; }
  .leaflet-popup-content-wrapper {
    background:#0F2318; border:1px solid #1A3A22;
    border-radius:14px; color:#fff; font-family:Cairo,Arial,sans-serif;
    box-shadow:0 4px 24px #000a;
  }
  .leaflet-popup-tip { background:#0F2318; }
  .leaflet-popup-content { margin:12px 14px; min-width:160px; }
  .popup-name { font-size:15px; font-weight:700; color:#fff; margin-bottom:4px; }
  .popup-addr { font-size:12px; color:#4A7A5A; margin-bottom:8px; }
  .popup-call {
    display:inline-block; background:#3EFF9C22; border:1px solid #3EFF9C55;
    color:#3EFF9C; padding:5px 12px; border-radius:8px; font-size:13px;
    cursor:pointer; text-decoration:none; margin-top:2px;
  }
  .leaflet-control-attribution { display:none!important; }
  .leaflet-tile { filter: brightness(0.85) saturate(0.9); }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var places = ${placesJson};
  var user   = ${userJson};

  var map = L.map('map', {
    center: [14.6839, 33.3833],
    zoom: 15,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  function makeIcon(color) {
    return L.divIcon({
      className: '',
      html: '<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:'+color+';border:3px solid #fff;box-shadow:0 2px 8px #0006;transform:rotate(-45deg)"></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -34],
    });
  }

  places.forEach(function(p) {
    var popup = '<div class="popup-name">' + p.name + '</div>';
    if (p.address) popup += '<div class="popup-addr">' + p.address + '</div>';
    if (p.phone) popup += '<a class="popup-call" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\'call\',phone:\''+p.phone+'\'}))">' +
      '📞 ' + p.phone + '</a>';

    L.marker([p.lat, p.lng], { icon: makeIcon(p.color) })
      .addTo(map)
      .bindPopup(popup, { maxWidth: 240 });
  });

  if (user) {
    var userIcon = L.divIcon({
      className: '',
      html: '<div style="width:20px;height:20px;border-radius:50%;background:#3EFF9C;border:3px solid #fff;box-shadow:0 0 0 6px #3EFF9C33"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker([user.lat, user.lng], { icon: userIcon })
      .addTo(map)
      .bindPopup('<div class="popup-name">موقعك الحالي</div>');
    map.setView([user.lat, user.lng], 15);
  }

  window.filterCategory = function(cat) {
    map.eachLayer(function(l) { if (l._popup) map.removeLayer(l); });
    var filtered = cat === 'all' ? places : places.filter(function(p){ return p.category === cat; });
    filtered.forEach(function(p) {
      var popup = '<div class="popup-name">' + p.name + '</div>';
      if (p.address) popup += '<div class="popup-addr">' + p.address + '</div>';
      if (p.phone) popup += '<a class="popup-call" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\'call\',phone:\''+p.phone+'\'}))">' +
        '📞 ' + p.phone + '</a>';
      L.marker([p.lat, p.lng], { icon: makeIcon(p.color) })
        .addTo(map).bindPopup(popup, { maxWidth: 240 });
    });
    if (filtered.length > 0) {
      var bounds = L.latLngBounds(filtered.map(function(p){ return [p.lat, p.lng]; }));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  window.goToUser = function() {
    if (user) map.setView([user.lat, user.lng], 17);
  };
</script>
</body>
</html>`;
}

// ── iframe للويب (بديل WebView) ──────────────────────────────────────────────
function WebMapFrame({ html, onReady }: { html: string; onReady: () => void }) {
  const iframeRef = useRef<any>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    if (iframeRef.current) {
      iframeRef.current.src = url;
      iframeRef.current.onload = onReady;
    }
    return () => URL.revokeObjectURL(url);
  }, [html]);

  return React.createElement("iframe", {
    ref: iframeRef,
    style: {
      width: "100%", height: "100%", border: "none",
      background: BG, display: "block",
    },
    sandbox: "allow-scripts allow-same-origin",
  });
}

// ── الشاشة الرئيسية ──────────────────────────────────────────────────────────
export default function MapScreen() {
  const insets    = useSafeAreaInsets();
  const webRef    = useRef<WebView>(null);
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
    fetch(`${getApiUrl()}/api/map/places`)
      .then(r => r.json())
      .then(data => { if (active) { setPlaces(data); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });

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
    if (mapReady && webRef.current) {
      webRef.current.injectJavaScript(`window.filterCategory('${activeCat}'); true;`);
    }
  }, [activeCat, mapReady]);

  const handleMsg = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "call" && msg.phone) {
        Alert.alert("اتصال", `هل تريد الاتصال بـ ${msg.phone}؟`, [
          { text: "إلغاء", style: "cancel" },
          { text: "اتصال", onPress: () => Linking.openURL(`tel:${msg.phone}`) },
        ]);
      }
    } catch {}
  }, []);

  const goToUser = () => {
    if (!userLoc) {
      Alert.alert("الموقع", "لم يتم تحديد موقعك بعد. تأكد من تفعيل خدمة الموقع.");
      return;
    }
    webRef.current?.injectJavaScript("window.goToUser(); true;");
  };

  const filteredCount = activeCat === "all"
    ? places.length
    : places.filter(p => p.category === activeCat).length;

  const mapHtml = buildMapHtml(places, userLoc?.lat, userLoc?.lng);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <Animated.View entering={FadeIn.duration(400)} style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="map" size={22} color={CYBER} />
          <Text style={s.headerTitle}>خريطة المدينة</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={s.placeCount}>{filteredCount} مكان</Text>
          <TouchableOpacity style={s.locBtn} onPress={goToUser}>
            <Ionicons name="locate" size={18} color={CYBER} />
          </TouchableOpacity>
        </View>
      </Animated.View>

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
          <WebMapFrame html={mapHtml} onReady={() => setMapReady(true)} />
        ) : (
          <WebView
            ref={webRef}
            source={{ html: mapHtml, baseUrl: "https://hasahisawi.onrender.com" }}
            style={s.webview}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            startInLoadingState
            onLoad={() => setMapReady(true)}
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
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ── الأنماط ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerLeft:   { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle:  { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  headerRight:  { flexDirection: "row", alignItems: "center", gap: 10 },
  placeCount:   { fontFamily: "Cairo_500Medium", fontSize: 13, color: MUTED },
  locBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: CYBER + "18",
                  alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: CYBER + "40" },
  filterWrap:   { borderBottomWidth: 1, borderBottomColor: BORDER },
  filterScroll: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip:         { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12,
                  paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER,
                  backgroundColor: CARD },
  chipTxt:      { fontFamily: "Cairo_500Medium", fontSize: 13, color: MUTED },
  mapWrap:      { flex: 1 },
  webview:      { flex: 1, backgroundColor: BG },
  center:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadTxt:      { fontFamily: "Cairo_400Regular", fontSize: 14, color: MUTED },
  legend:       { backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 },
  legendTitle:  { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: MUTED,
                  paddingHorizontal: 16, marginBottom: 6 },
  legendScroll: { paddingHorizontal: 12, gap: 10 },
  legendItem:   { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot:    { width: 10, height: 10, borderRadius: 5 },
  legendTxt:    { fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED },
});
