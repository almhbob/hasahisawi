import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

async function api(path: string, opts?: { method?: string; body?: unknown }) {
  const res = await apiFetch(path, {
    method: opts?.method ?? "GET",
    ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  try { return await res.json(); } catch { return null; }
}

type Package = {
  id: number; name: string; description: string;
  price_monthly: number; max_products: number; is_unlimited: boolean;
  is_featured: boolean; color: string; icon: string;
  features: string[]; is_active: boolean; sort_order: number;
};
type Member = {
  id: number; shop_name: string; bio: string; avatar_url: string;
  whatsapp: string; instagram: string; categories: string[];
  status: string; expires_at: string; created_at: string;
  package_name: string; pkg_color: string;
  product_count: number; order_count: number;
};
type Order = {
  id: number; customer_name: string; customer_phone: string;
  customer_notes: string; status: string; created_at: string;
  shop_name: string; product_title: string; member_id: number;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: "بانتظار المراجعة", color: "#F59E0B" },
  active:     { label: "مفعّل",            color: "#22C55E" },
  suspended:  { label: "موقوف",            color: "#EF4444" },
  expired:    { label: "منتهي",            color: "#6B7280" },
};
const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  new:        { label: "جديد",      color: "#A855F7" },
  processing: { label: "قيد التنفيذ", color: "#F59E0B" },
  done:       { label: "مكتمل",     color: "#22C55E" },
  cancelled:  { label: "ملغي",      color: "#EF4444" },
};

const card: React.CSSProperties = {
  background: "hsl(220 47% 11%)", borderRadius: 16,
  border: "1px solid hsl(217 32% 15%)", padding: "20px 24px",
};
const input: React.CSSProperties = {
  background: "hsl(222 47% 8%)", border: "1px solid hsl(217 32% 18%)",
  borderRadius: 10, padding: "10px 14px", color: "hsl(215 20% 85%)",
  fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  direction: "rtl",
};
const btn = (color = "#22C55E"): React.CSSProperties => ({
  background: color, color: "#fff", border: "none", borderRadius: 10,
  padding: "8px 16px", cursor: "pointer", fontSize: 13,
  fontFamily: "inherit", fontWeight: 700,
});
const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid hsl(217 32% 20%)",
  color: "hsl(215 20% 65%)", borderRadius: 10, padding: "7px 14px",
  cursor: "pointer", fontSize: 13, fontFamily: "inherit",
};

export default function DesignGallery() {
  const [tab, setTab] = useState<"members"|"orders"|"packages">("members");
  const [members,  setMembers]  = useState<Member[]>([]);
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState("");

  // باقة جديدة
  const [pkgForm, setPkgForm] = useState(false);
  const [pkgData, setPkgData] = useState({
    name: "", description: "", price_monthly: "", max_products: "10",
    is_unlimited: false, is_featured: false, color: "#22C55E", icon: "🎨",
    features: "", sort_order: "0",
  });

  // فلتر
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderFilter,  setOrderFilter]  = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [m, o, p] = await Promise.all([
        api("/admin/design-gallery/members"),
        api("/admin/design-gallery/orders"),
        api("/design-gallery/packages"),
      ]);
      if (Array.isArray(m)) setMembers(m);
      if (Array.isArray(o)) setOrders(o);
      if (Array.isArray(p)) setPackages(p);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const updateMember = async (id: number, status: string) => {
    const expires_at = status === "active"
      ? new Date(Date.now() + 30 * 86400_000).toISOString()
      : undefined;
    await api(`/admin/design-gallery/members/${id}`, {
      method: "PATCH", body: { status, ...(expires_at ? { expires_at } : {}) },
    });
    flash("تم التحديث ✓"); load();
  };

  const deleteMember = async (id: number) => {
    if (!confirm("حذف هذا المصمم وجميع منتجاته؟")) return;
    await api(`/admin/design-gallery/members/${id}`, { method: "DELETE" });
    flash("تم الحذف"); load();
  };

  const updateOrder = async (id: number, status: string) => {
    await api(`/admin/design-gallery/orders/${id}`, { method: "PATCH", body: { status } });
    flash("تم التحديث ✓"); load();
  };

  const addPackage = async () => {
    if (!pkgData.name) return;
    await api("/admin/design-gallery/packages", {
      method: "POST",
      body: {
        ...pkgData,
        price_monthly: Number(pkgData.price_monthly),
        max_products:  Number(pkgData.max_products),
        sort_order:    Number(pkgData.sort_order),
        features: pkgData.features.split("\n").filter(Boolean),
      },
    });
    setPkgForm(false);
    setPkgData({ name:"", description:"", price_monthly:"", max_products:"10",
      is_unlimited:false, is_featured:false, color:"#22C55E", icon:"🎨", features:"", sort_order:"0" });
    flash("تمت الإضافة ✓"); load();
  };

  const togglePkg = async (id: number, is_active: boolean) => {
    await api(`/admin/design-gallery/packages/${id}`, { method: "PATCH", body: { is_active } });
    flash("تم التحديث ✓"); load();
  };

  const deletePkg = async (id: number) => {
    if (!confirm("حذف هذه الباقة؟")) return;
    await api(`/admin/design-gallery/packages/${id}`, { method: "DELETE" });
    flash("تم الحذف"); load();
  };

  const filteredMembers = members.filter(m =>
    statusFilter === "all" || m.status === statusFilter
  );
  const filteredOrders = orders.filter(o =>
    orderFilter === "all" || o.status === orderFilter
  );

  // إحصائيات
  const stats = {
    total:   members.length,
    active:  members.filter(m => m.status === "active").length,
    pending: members.filter(m => m.status === "pending").length,
    orders:  orders.length,
  };

  return (
    <div style={{ padding: "0 24px 40px", direction: "rtl", maxWidth: 1100, margin: "0 auto" }}>

      {/* رأس الصفحة */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "hsl(215 20% 90%)", fontSize: 24, margin: 0, fontWeight: 700 }}>
          🎨 معرض التصاميم
        </h1>
        <p style={{ color: "hsl(215 20% 50%)", margin: "6px 0 0", fontSize: 14 }}>
          إدارة المصممين والطلبات والباقات
        </p>
      </div>

      {/* flash */}
      {msg && (
        <div style={{
          background: "#22C55E20", border: "1px solid #22C55E40", borderRadius: 12,
          padding: "12px 20px", marginBottom: 20, color: "#22C55E",
          fontWeight: 700, fontSize: 14,
        }}>{msg}</div>
      )}

      {/* إحصائيات */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "إجمالي المصممين", val: stats.total,   color: "#A855F7" },
          { label: "مفعّلون",         val: stats.active,  color: "#22C55E" },
          { label: "بانتظار القبول",  val: stats.pending, color: "#F59E0B" },
          { label: "الطلبات",         val: stats.orders,  color: "#06B6D4" },
        ].map(s => (
          <div key={s.label} style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 12, color: "hsl(215 20% 50%)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* تبويبات */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "members",  label: `الأعضاء (${stats.total})` },
          { key: "orders",   label: `الطلبات (${stats.orders})` },
          { key: "packages", label: `الباقات (${packages.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{
            background: tab === t.key ? "#A855F7" : "hsl(220 47% 11%)",
            color: tab === t.key ? "#fff" : "hsl(215 20% 60%)",
            border: `1px solid ${tab === t.key ? "#A855F7" : "hsl(217 32% 15%)"}`,
            borderRadius: 10, padding: "9px 20px", cursor: "pointer",
            fontSize: 14, fontFamily: "inherit", fontWeight: 600,
          }}>{t.label}</button>
        ))}
        <button onClick={load} style={{ ...ghostBtn, marginRight: "auto" }}>
          🔄 تحديث
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "hsl(215 20% 50%)" }}>
          جارٍ التحميل...
        </div>
      )}

      {/* ══ تبويب الأعضاء ══ */}
      {!loading && tab === "members" && (
        <div>
          {/* فلتر الحالة */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["all","pending","active","suspended","expired"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                background: statusFilter === s ? "#A855F720" : "transparent",
                border: `1px solid ${statusFilter === s ? "#A855F7" : "hsl(217 32% 18%)"}`,
                color: statusFilter === s ? "#A855F7" : "hsl(215 20% 55%)",
                borderRadius: 8, padding: "5px 12px", cursor: "pointer",
                fontSize: 12, fontFamily: "inherit",
              }}>
                {s === "all" ? "الكل" : STATUS_LABELS[s]?.label ?? s}
              </button>
            ))}
          </div>

          {filteredMembers.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 40%)" }}>
              لا يوجد مصممون في هذه الفئة
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredMembers.map(m => {
                const st = STATUS_LABELS[m.status] ?? { label: m.status, color: "#888" };
                return (
                  <div key={m.id} style={card}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                      {/* أفاتار */}
                      <div style={{
                        width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                        background: `${m.pkg_color ?? "#A855F7"}30`,
                        border: `2px solid ${m.pkg_color ?? "#A855F7"}60`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 22, fontWeight: 800, color: m.pkg_color ?? "#A855F7",
                      }}>
                        {m.shop_name?.charAt(0) ?? "م"}
                      </div>

                      {/* معلومات */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ color: "hsl(215 20% 90%)", fontWeight: 700, fontSize: 16 }}>
                            {m.shop_name}
                          </span>
                          {m.package_name && (
                            <span style={{
                              background: `${m.pkg_color ?? "#A855F7"}20`,
                              color: m.pkg_color ?? "#A855F7",
                              border: `1px solid ${m.pkg_color ?? "#A855F7"}40`,
                              borderRadius: 8, padding: "2px 10px", fontSize: 11, fontWeight: 700,
                            }}>{m.package_name}</span>
                          )}
                          <span style={{
                            background: st.color + "20", color: st.color,
                            border: `1px solid ${st.color}40`,
                            borderRadius: 8, padding: "2px 10px", fontSize: 11, fontWeight: 700,
                          }}>{st.label}</span>
                        </div>
                        {m.bio && (
                          <div style={{ color: "hsl(215 20% 55%)", fontSize: 13, marginTop: 4 }}>
                            {m.bio}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                          {m.whatsapp && (
                            <span style={{ fontSize: 12, color: "#25D366" }}>
                              📱 {m.whatsapp}
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: "hsl(215 20% 50%)" }}>
                            📦 {m.product_count ?? 0} منتج
                          </span>
                          <span style={{ fontSize: 12, color: "hsl(215 20% 50%)" }}>
                            🛒 {m.order_count ?? 0} طلب
                          </span>
                          <span style={{ fontSize: 12, color: "hsl(215 20% 40%)" }}>
                            {new Date(m.created_at).toLocaleDateString("ar-SA")}
                          </span>
                          {m.expires_at && (
                            <span style={{ fontSize: 12, color: "hsl(215 20% 40%)" }}>
                              ينتهي: {new Date(m.expires_at).toLocaleDateString("ar-SA")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* أزرار */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {m.status === "pending" && (
                          <button onClick={() => updateMember(m.id, "active")}
                            style={btn("#22C55E")}>✓ قبول</button>
                        )}
                        {m.status === "active" && (
                          <button onClick={() => updateMember(m.id, "suspended")}
                            style={btn("#F59E0B")}>وقف</button>
                        )}
                        {m.status === "suspended" && (
                          <button onClick={() => updateMember(m.id, "active")}
                            style={btn("#22C55E")}>تفعيل</button>
                        )}
                        <button onClick={() => deleteMember(m.id)}
                          style={btn("#EF4444")}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب الطلبات ══ */}
      {!loading && tab === "orders" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["all","new","processing","done","cancelled"].map(s => (
              <button key={s} onClick={() => setOrderFilter(s)} style={{
                background: orderFilter === s ? "#06B6D420" : "transparent",
                border: `1px solid ${orderFilter === s ? "#06B6D4" : "hsl(217 32% 18%)"}`,
                color: orderFilter === s ? "#06B6D4" : "hsl(215 20% 55%)",
                borderRadius: 8, padding: "5px 12px", cursor: "pointer",
                fontSize: 12, fontFamily: "inherit",
              }}>
                {s === "all" ? "الكل" : ORDER_STATUS[s]?.label ?? s}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "hsl(215 20% 40%)" }}>
              لا توجد طلبات
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredOrders.map(o => {
                const st = ORDER_STATUS[o.status] ?? { label: o.status, color: "#888" };
                return (
                  <div key={o.id} style={card}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span style={{ color: "hsl(215 20% 85%)", fontWeight: 700 }}>
                            {o.customer_name}
                          </span>
                          <span style={{
                            background: st.color + "20", color: st.color,
                            border: `1px solid ${st.color}40`,
                            borderRadius: 8, padding: "2px 10px", fontSize: 11, fontWeight: 700,
                          }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "hsl(215 20% 55%)" }}>
                          📱 {o.customer_phone}
                          {o.product_title && ` · 🎨 ${o.product_title}`}
                          {` · 🏪 ${o.shop_name}`}
                        </div>
                        {o.customer_notes && (
                          <div style={{
                            marginTop: 8, fontSize: 13, color: "hsl(215 20% 65%)",
                            background: "hsl(222 47% 7%)", borderRadius: 10, padding: "8px 12px",
                          }}>
                            {o.customer_notes}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "hsl(215 20% 40%)", marginTop: 6 }}>
                          {new Date(o.created_at).toLocaleString("ar-SA")}
                        </div>
                      </div>

                      {/* تحديث الحالة */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {o.status === "new" && (
                          <button onClick={() => updateOrder(o.id, "processing")}
                            style={btn("#F59E0B")}>قيد التنفيذ</button>
                        )}
                        {(o.status === "new" || o.status === "processing") && (
                          <button onClick={() => updateOrder(o.id, "done")}
                            style={btn("#22C55E")}>✓ مكتمل</button>
                        )}
                        {o.status !== "cancelled" && o.status !== "done" && (
                          <button onClick={() => updateOrder(o.id, "cancelled")}
                            style={btn("#EF4444")}>إلغاء</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ تبويب الباقات ══ */}
      {!loading && tab === "packages" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button onClick={() => setPkgForm(!pkgForm)} style={btn("#A855F7")}>
              {pkgForm ? "✕ إغلاق" : "+ إضافة باقة"}
            </button>
          </div>

          {/* نموذج إضافة باقة */}
          {pkgForm && (
            <div style={{ ...card, marginBottom: 20 }}>
              <h3 style={{ color: "hsl(215 20% 85%)", margin: "0 0 16px", fontSize: 16 }}>
                ✦ باقة جديدة
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[
                  { key: "name",          label: "اسم الباقة *" },
                  { key: "price_monthly", label: "السعر الشهري (ج.س)" },
                  { key: "max_products",  label: "عدد المنتجات" },
                  { key: "color",         label: "اللون (hex)" },
                  { key: "icon",          label: "الأيقونة (emoji)" },
                  { key: "sort_order",    label: "الترتيب" },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ color: "hsl(215 20% 55%)", fontSize: 12, display: "block", marginBottom: 6 }}>
                      {f.label}
                    </label>
                    <input style={input}
                      value={(pkgData as any)[f.key]}
                      onChange={e => setPkgData(p => ({ ...p, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ color: "hsl(215 20% 55%)", fontSize: 12, display: "block", marginBottom: 6 }}>
                  الوصف
                </label>
                <input style={input} value={pkgData.description}
                  onChange={e => setPkgData(p => ({ ...p, description: e.target.value }))}
                  placeholder="وصف مختصر للباقة"
                />
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ color: "hsl(215 20% 55%)", fontSize: 12, display: "block", marginBottom: 6 }}>
                  الميزات (سطر لكل ميزة)
                </label>
                <textarea style={{ ...input, height: 80, resize: "vertical" } as React.CSSProperties}
                  value={pkgData.features}
                  onChange={e => setPkgData(p => ({ ...p, features: e.target.value }))}
                  placeholder={"ميزة 1\nميزة 2\nميزة 3"}
                />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center" }}>
                <label style={{ color: "hsl(215 20% 70%)", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={pkgData.is_featured}
                    onChange={e => setPkgData(p => ({ ...p, is_featured: e.target.checked }))}
                    style={{ marginLeft: 6 }}
                  />
                  مميّزة
                </label>
                <label style={{ color: "hsl(215 20% 70%)", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={pkgData.is_unlimited}
                    onChange={e => setPkgData(p => ({ ...p, is_unlimited: e.target.checked }))}
                    style={{ marginLeft: 6 }}
                  />
                  منتجات غير محدودة
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
                <button onClick={() => setPkgForm(false)} style={ghostBtn}>إلغاء</button>
                <button onClick={addPackage} style={btn("#A855F7")}>💾 حفظ الباقة</button>
              </div>
            </div>
          )}

          {/* قائمة الباقات */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 16 }}>
            {packages.map(pkg => (
              <div key={pkg.id} style={{
                ...card, borderColor: pkg.color + "40",
                background: `linear-gradient(135deg, ${pkg.color}18, hsl(220 47% 11%))`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: pkg.color + "30", border: `2px solid ${pkg.color}60`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 24,
                  }}>{pkg.icon}</div>
                  <div>
                    <div style={{ color: pkg.color, fontWeight: 800, fontSize: 18 }}>{pkg.name}</div>
                    <div style={{ color: "hsl(215 20% 50%)", fontSize: 12 }}>{pkg.description}</div>
                  </div>
                </div>

                <div style={{ color: pkg.color, fontSize: 26, fontWeight: 800, marginBottom: 4 }}>
                  {pkg.price_monthly.toLocaleString()} ج.س
                  <span style={{ color: "hsl(215 20% 50%)", fontSize: 13, fontWeight: 400 }}> / شهر</span>
                </div>

                <div style={{ fontSize: 12, color: "hsl(215 20% 55%)", marginBottom: 12 }}>
                  {pkg.is_unlimited ? "منتجات غير محدودة" : `${pkg.max_products} منتج`}
                  {pkg.is_featured && " · مميّزة ⭐"}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {pkg.features?.map((f, i) => (
                    <div key={i} style={{ fontSize: 12, color: "hsl(215 20% 65%)", display: "flex", gap: 6 }}>
                      <span style={{ color: pkg.color }}>✓</span> {f}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => togglePkg(pkg.id, !pkg.is_active)} style={btn(pkg.is_active ? "#F59E0B" : "#22C55E")}>
                    {pkg.is_active ? "إيقاف" : "تفعيل"}
                  </button>
                  <button onClick={() => deletePkg(pkg.id)} style={btn("#EF4444")}>🗑</button>
                </div>

                {!pkg.is_active && (
                  <div style={{
                    marginTop: 10, textAlign: "center", fontSize: 12,
                    color: "#EF4444", fontWeight: 700,
                  }}>موقوفة</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
