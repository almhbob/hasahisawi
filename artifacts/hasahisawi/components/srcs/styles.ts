import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { SRCS_RED } from "@/lib/red-crescent";

// أنماط مشتركة لشاشات الهلال الأحمر
export const srcsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.text },
  card: { padding: 14, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 12.5, lineHeight: 20, color: Colors.textSecondary, textAlign: "right" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  primary: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 14, backgroundColor: SRCS_RED },
  primaryTxt: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  ghost: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: SRCS_RED + "66" },
  ghostTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: SRCS_RED },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  chipTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
  itemTitle: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.text, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  metaStrong: { fontFamily: "Cairo_700Bold", fontSize: 12, color: SRCS_RED },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: Colors.textSecondary, textAlign: "right" },
  empty: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingVertical: 12 },
  error: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.danger, textAlign: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 10 },
  sheetHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
});
