import React, { Component, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

type Props = { children: ReactNode; fallback?: (err: Error, reset: () => void) => ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0F172A" }}>
        <View style={{ width: "100%", maxWidth: 480, backgroundColor: "#1E293B", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#334155" }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#FBBF24", textAlign: "center", marginBottom: 8 }}>
            حدث خطأ غير متوقع
          </Text>
          <Text style={{ color: "#CBD5E1", textAlign: "center", marginBottom: 16, lineHeight: 22 }}>
            نعتذر عن الإزعاج. حدث خطأ في هذه الشاشة. يمكنك إعادة المحاولة الآن.
          </Text>
          <Text style={{ color: "#94A3B8", fontSize: 12, textAlign: "center", marginBottom: 16 }}>
            {error.message}
          </Text>
          <Pressable
            onPress={this.reset}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#EA580C" : "#F97316",
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
            })}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }
}

export default ErrorBoundary;
