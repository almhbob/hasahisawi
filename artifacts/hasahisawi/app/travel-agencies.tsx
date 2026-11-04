// «وكالات السفر والسياحة» — مدخل عام (روابط الدعوات والمشاركة) إلى مركز السفريات على تبويب الوكالات.
// يبقى المسار /travel-agencies?invite=… صالحاً: يفتح نموذج الانضمام مُعبّأً من الدعوة.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { TravelHub } from "@/app/(tabs)/travel";

function TravelAgenciesScreen() {
  const params = useLocalSearchParams<{ invite?: string; tab?: string }>();
  return <TravelHub initialTab={params.tab || "agencies"} inviteToken={params.invite} />;
}

export default TravelAgenciesScreen;
