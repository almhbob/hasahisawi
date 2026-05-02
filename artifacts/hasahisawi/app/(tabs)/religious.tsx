import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { RELIGIOUS_DAILY_CONTENT, getReligiousCategoryLabel } from "@/lib/religious-content";

export default function ReligiousScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>🕌 المساحة الدينية</Text>

      <FlatList
        data={RELIGIOUS_DAILY_CONTENT}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="moon" size={18} color={Colors.primary} />
              <Text style={styles.category}>{getReligiousCategoryLabel(item.category)}</Text>
            </View>

            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, padding: 16 },
  header: {
    fontSize: 20,
    fontWeight: "bold",
    color: Colors.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  card: {
    backgroundColor: Colors.cardBg,
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  category: { color: Colors.primary, fontSize: 12 },
  title: { fontSize: 15, fontWeight: "bold", color: "#fff", marginTop: 6 },
  body: { fontSize: 13, color: "#aaa", marginTop: 4, lineHeight: 20 },
});
