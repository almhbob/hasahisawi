import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/Layout";
import { apiFetch, apiJson } from "@/lib/api";

type Post = {
  id: number; author_name: string; content: string;
  category: string; created_at: string; image_url?: string;
  likes_count?: number; comments_count?: number;
};

const CATS = ["الكل","عام","إعلانات","نقاشات","مناسبات","رياضة","ثقافة","وظائف"];

export default function Posts() {
  const [posts,   setPosts]   = useState<Post[]>([]);
  const [search,  setSearch]  = useState("");
  const [cat,     setCat]     = useState("الكل");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<Post[]>("/posts?limit=200");
      setPosts(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deletePost = async (id: number) => {
    if (!confirm("هل تريد حذف هذا المنشور؟")) return;
    setDeleting(id);
    try {
      await apiFetch(`/posts/${id}`, { method: "DELETE" });
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch {}
    setDeleting(null);
  };

  const filtered = posts.filter(p => {
    if (cat !== "الكل" && p.category !== cat) return false;
    if (search && !p.content.includes(search) && !p.author_name.includes(search)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="إشراف المنشورات"
        subtitle={`${filtered.length} منشور`}
        action={
          <input
            className="input-field" style={{ width: 240, padding: "9px 14px" }}
            placeholder="بحث في المحتوى..." value={search} onChange={e => setSearch(e.target.value)}
          />
        }
      />
      <div style={{ padding: "16px 28px 8px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{
              padding: "7px 14px", borderRadius: 20, border: "1px solid",
              borderColor: cat === c ? "hsl(147 60% 42% / 0.5)" : "hsl(217 32% 17%)",
              background: cat === c ? "hsl(147 60% 42% / 0.15)" : "transparent",
              color: cat === c ? "hsl(147 60% 52%)" : "hsl(215 20% 60%)",
              cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
            }}
          >{c}</button>
        ))}
      </div>
      <div style={{ padding: "12px 28px 28px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0", fontSize: 15 }}>جارٍ التحميل...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "hsl(215 20% 50%)", padding: "60px 0", fontSize: 14 }}>لا يوجد منشورات</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {filtered.map(p => (
              <div key={p.id} style={{
                background: "hsl(222 47% 10%)", borderRadius: 16, border: "1px solid hsl(217 32% 14%)",
                padding: 18, display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, background: "hsl(217 32% 17%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 700, color: "hsl(38 90% 60%)",
                    }}>{p.author_name?.[0] || "؟"}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(210 40% 90%)" }}>{p.author_name}</div>
                      <div style={{ fontSize: 11, color: "hsl(215 20% 50%)" }}>
                        {new Date(p.created_at).toLocaleDateString("ar")}
                      </div>
                    </div>
                  </div>
                  <span className="badge-blue" style={{ fontSize: 11 }}>{p.category}</span>
                </div>
                <p style={{ fontSize: 13, color: "hsl(210 40% 80%)", lineHeight: 1.6, margin: 0 }}>
                  {p.content.length > 200 ? p.content.slice(0, 200) + "..." : p.content}
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", display: "flex", gap: 12 }}>
                    <span>❤️ {p.likes_count || 0}</span>
                    <span>💬 {p.comments_count || 0}</span>
                  </div>
                  <button
                    className="btn-danger"
                    style={{ fontSize: 11, padding: "5px 10px" }}
                    onClick={() => deletePost(p.id)}
                    disabled={deleting === p.id}
                  >
                    {deleting === p.id ? "جارٍ الحذف..." : "🗑️ حذف"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
