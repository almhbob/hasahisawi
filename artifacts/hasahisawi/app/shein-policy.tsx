/** سياسة خدمة طلبات شي إن — يقرؤها العميل ويوافق عليها قبل إرسال أي طلب */
import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeuButton } from "@/components/auth/neu";
import PolicyView from "@/components/shein/PolicyView";
import { ACCENT, Empty, Shell, u } from "@/components/shein/ui";
import { setPolicyAccepted, sheinApi, SheinSettings } from "@/lib/shein-api";

export default function SheinPolicyScreen() {
  const insets = useSafeAreaInsets();
  const { accept } = useLocalSearchParams<{ accept?: string }>();
  const [s, setS] = useState<SheinSettings | null>(null);
  const [err, setErr] = useState("");
  useFocusEffect(useCallback(() => { sheinApi.config().then(r => setS(r.settings)).catch(e => setErr(e?.message || "تعذّر التحميل")); }, []));
  const updated = s && s.policy_version !== "default" && !isNaN(Date.parse(s.policy_version))
    ? new Date(s.policy_version).toLocaleDateString("ar-SD", { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <Shell title="سياسة خدمة شي إن" sub={updated ? `آخر تحديث: ${updated}` : "اقرأها قبل إرسال طلبك"} insets={insets}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        {err ? <Empty icon="alert-circle-outline" text={err} /> : !s ? <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} /> : (
          <>
            <PolicyView text={s.policy} />
            {accept ? (
              <NeuButton label="قرأت السياسة وأوافق عليها" icon="checkmark-circle" onPress={() => { setPolicyAccepted(s.policy_version); router.back(); }} />
            ) : null}
            <Text style={[u.meta, { textAlign: "center" }]}>لأي استفسار عن طلبك تواصل مع الدعم من داخل التطبيق.</Text>
          </>
        )}
      </ScrollView>
    </Shell>
  );
}
