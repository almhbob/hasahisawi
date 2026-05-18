import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'app/(tabs)/travel.tsx');
let src = fs.readFileSync(file, 'utf8');

src = src.replaceAll('name="airplane"', 'name="bus"');
src = src.replaceAll('name="airplane-takeoff"', 'name="bus-clock"');
src = src.replaceAll('icon:"airplane-outline"', 'icon:"bus-outline"');
src = src.replaceAll('✈️ تذكرة سفر', '🚌 تذكرة سفر');
src = src.replaceAll('✈️ تذكير — رحلتك بعد ساعتين!', '🚌 تذكير — رحلتك بعد ساعتين!');
src = src.replace('تذاكر السفر</Text>', 'السفريات</Text>');
src = src.replace('حجز آمن بين مدن السودان</Text>', 'حجوزات موثوقة عبر شركات ووكالات السفر</Text>');

src = src.replace(
  '  TextInput, Platform, Alert, Modal, Share, Linking,',
  '  TextInput, Platform, Alert, Modal, Share, Linking, KeyboardAvoidingView,'
);

const helperAnchor = '// ═══════════════════════════════════════════════════════════════\n// نموذج الحجز';
if (!src.includes('function getUpcomingTravelDates()')) {
  src = src.replace(helperAnchor, `function getUpcomingTravelDates() {\n  return Array.from({ length: 7 }).map((_, index) => {\n    const date = new Date();\n    date.setDate(date.getDate() + index);\n    const iso = date.toISOString().slice(0, 10);\n    const label = index === 0 ? \"اليوم\" : index === 1 ? \"غداً\" : date.toLocaleDateString(\"ar-SD\", { weekday: \"short\", day: \"numeric\", month: \"short\" });\n    return { iso, label };\n  });\n}\n\n${helperAnchor}`);
}

src = src.replace(
  '  if (step === "confirm") {\n    return (\n      <ScrollView contentContainerStyle={{ padding:16 }}>',
  '  if (step === "confirm") {\n    return (\n      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>\n        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding:16, paddingBottom:180 }}>'
);

src = src.replace(
  '        </AnimatedPress>\n      </ScrollView>\n    );\n  }',
  '        </AnimatedPress>\n        </ScrollView>\n      </KeyboardAvoidingView>\n    );\n  }'
);

const oldDateField = `        <Text style={styles.fieldLabel}>تاريخ السفر * (YYYY-MM-DD)</Text>\n        <TextInput style={styles.input} value={travelDate} onChangeText={setTravelDate}\n          placeholder=\"2026-05-20\" keyboardType=\"numeric\" maxLength={10} />`;
const newDateField = `        <Text style={styles.fieldLabel}>تاريخ السفر *</Text>\n        <View style={styles.dateChipGrid}>\n          {getUpcomingTravelDates().map((date) => (\n            <TouchableOpacity key={date.iso} onPress={() => setTravelDate(date.iso)} style={[styles.dateChip, travelDate === date.iso && styles.dateChipActive]}>\n              <Ionicons name=\"calendar-outline\" size={14} color={travelDate === date.iso ? \"#fff\" : ACCENT} />\n              <Text style={[styles.dateChipText, travelDate === date.iso && styles.dateChipTextActive]}>{date.label}</Text>\n              <Text style={[styles.dateChipSub, travelDate === date.iso && styles.dateChipTextActive]}>{date.iso}</Text>\n            </TouchableOpacity>\n          ))}\n        </View>\n        <TextInput style={styles.input} value={travelDate} onChangeText={setTravelDate} placeholder=\"أو أدخل التاريخ: 2026-05-20\" placeholderTextColor=\"#4B6A8A\" keyboardType=\"numbers-and-punctuation\" maxLength={10} />`;
src = src.replace(oldDateField, newDateField);

src = src.replace(
  '<Text style={styles.confirmCompany}>{selectedRoute?.company_name}</Text>',
  '<View style={styles.confirmCompanyBadge}><Ionicons name="business-outline" size={14} color={ACCENT2} /><Text style={styles.confirmCompanyBadgeText}>{selectedRoute?.company_name}</Text></View>'
);

src = src.replace(
  '  input:           { backgroundColor:Colors.cardBg, borderRadius:10, padding:12, color:Colors.text, fontSize:14, borderWidth:1, borderColor:Colors.borderSubtle },',
  '  input:           { backgroundColor:Colors.cardBg, borderRadius:10, padding:12, color:Colors.text, fontSize:14, borderWidth:1, borderColor:Colors.borderSubtle },\n  dateChipGrid:    { flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:10 },\n  dateChip:        { minWidth:"30%", flexGrow:1, backgroundColor:Colors.cardBg, borderRadius:12, paddingVertical:10, paddingHorizontal:10, borderWidth:1, borderColor:Colors.borderSubtle, alignItems:"center", gap:3 },\n  dateChipActive:  { backgroundColor:ACCENT, borderColor:ACCENT },\n  dateChipText:    { color:Colors.text, fontSize:12, fontWeight:"700" },\n  dateChipSub:     { color:Colors.textMuted, fontSize:10, fontWeight:"600" },\n  dateChipTextActive:{ color:"#fff" },'
);

src = src.replace(
  '  confirmCompany:  { fontSize:14, color:"#93C5FD", marginBottom:4 },',
  '  confirmCompany:  { fontSize:14, color:"#93C5FD", marginBottom:4 },\n  confirmCompanyBadge:{ flexDirection:"row-reverse", alignItems:"center", gap:6, backgroundColor:"#ffffff12", borderWidth:1, borderColor:ACCENT2+"35", paddingHorizontal:12, paddingVertical:6, borderRadius:999, marginBottom:6 },\n  confirmCompanyBadgeText:{ fontSize:14, color:"#E0F2FE", fontWeight:"800" },'
);

fs.writeFileSync(file, src);
console.log('travel bus/date/company patch applied');
