import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const MOCK_CONTESTS = [
  {
    id: "1",
    title: "أفضل صورة للمدينة",
    description: "التقط أجمل صورة في الحصاحيصا واربح جائزة!",
    participants: 12,
  },
  {
    id: "2",
    title: "أفضل فكرة مشروع",
    description: "شارك فكرتك وادعمها المجتمع",
    participants: 7,
  },
];

export default function ContestScreen() {
  const [entries, setEntries] = useState<Record<string, string>>({});

  const handleJoin = (id: string) => {
    if (!entries[id]) {
      Alert.alert("تنبيه", "اكتب مشاركتك أولاً");
      return;
    }

    Alert.alert("تم الاشتراك", "تم إرسال مشاركتك بنجاح 🎉");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🏆 المسابقات</Text>

      <FlatList
        data={MOCK_CONTESTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.description}</Text>

            <View style={styles.row}>
              <Ionicons name="people" size={16} color={Colors.primary} />
              <Text style={styles.meta}>{item.participants} مشارك</Text>
            </View>

            <TextInput
              placeholder="اكتب مشاركتك..."
              placeholderTextColor="#999"
              style={styles.input}
              value={entries[item.id] || ""}
              onChangeText={(text) => setEntries((prev) => ({ ...prev, [item.id]: text }))}
            />

            <TouchableOpacity style={styles.btn} onPress={() => handleJoin(item.id)}>
              <Text style={styles.btnText}>اشترك</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    padding: 16,
  },
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
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  desc: {
    fontSize: 13,
    color: "#aaa",
    marginVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  meta: {
    color: Colors.primary,
    fontSize: 12,
  },
  input: {
    backgroundColor: "#111",
    color: "#fff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  btn: {
    backgroundColor: Colors.primary,
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: {
    color: "#000",
    fontWeight: "bold",
  },
});
