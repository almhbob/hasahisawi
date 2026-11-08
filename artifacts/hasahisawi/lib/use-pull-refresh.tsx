/**
 * تحديث الشاشة بالسحب للأسفل: يعيد عنصر RefreshControl جاهزاً لتمريره إلى ScrollView/FlatList.
 *   const refresh = usePullRefresh(load);
 *   <ScrollView refreshControl={refresh}>…
 */
import React, { useCallback, useState } from "react";
import { RefreshControl } from "react-native";

export function usePullRefresh(fn: () => unknown, color = "#00966A") {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fn(); } finally { setRefreshing(false); }
  }, [fn]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color} colors={[color]} />;
}
