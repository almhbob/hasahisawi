import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: "hsl(222 47% 10%)",
            borderRadius: 16,
            border: "1px solid hsl(217 32% 14%)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Skeleton style={{ width: 34, height: 34, borderRadius: 10 }} />
            <div style={{ flex: 1 }}>
              <Skeleton style={{ width: "40%", height: 12, marginBottom: 6 }} />
              <Skeleton style={{ width: "25%", height: 10 }} />
            </div>
          </div>
          <Skeleton style={{ width: "100%", height: 12 }} />
          <Skeleton style={{ width: "85%", height: 12 }} />
          <Skeleton style={{ width: "60%", height: 12 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <Skeleton style={{ width: 80, height: 14 }} />
            <Skeleton style={{ width: 60, height: 22, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonRowList({ count = 8 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: "hsl(222 47% 10%)",
            borderRadius: 12,
            border: "1px solid hsl(217 32% 14%)",
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Skeleton style={{ width: 40, height: 40, borderRadius: 10 }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ width: "30%", height: 12, marginBottom: 6 }} />
            <Skeleton style={{ width: "55%", height: 10 }} />
          </div>
          <Skeleton style={{ width: 70, height: 24, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}
