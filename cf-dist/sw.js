const CACHE = "hasahisawi-v6.5.6-web-hotfix-20260626-01";
const OFFLINE = ["/", "/index.html"];

const DOM_PATCH = `
<script id="hasahisawi-web-hotfix-20260626">
(() => {
  const replacements = new Map([
    ["منصة حصاحيصا المحلية", "منصة لخدمة مواطن المنطقة وضواحيها"],
    ["خدمات، سوق، مشاوير، مطاعم، ومجتمع في مكان واحد", "كل خدمات المنطقة وضواحيها في مكان واحد"],
    ["تصميم زجاجي حديث يعتمد على أخضر الشعار وذهبه فقط، بواجهة عربية مريحة وواضحة.", "خدمات يومية، مؤسسات، مشاوير، سوق، ومحامون في تجربة واحدة واضحة وسريعة."],
    ["ألوان موحدة · واجهة زجاجية · تجربة أسرع", "اختر القسم الذي تحتاجه وابدأ مباشرة"],
  ]);

  function textNodes(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function replaceTexts() {
    if (!document.body) return;
    for (const node of textNodes(document.body)) {
      const v = node.nodeValue || "";
      for (const [from, to] of replacements) {
        if (v.includes(from)) node.nodeValue = v.split(from).join(to);
      }
    }
  }

  function hideDesignNote() {
    const nodes = textNodes(document.body).filter(n => (n.nodeValue || "").includes("هوية موحدة من الشعار"));
    for (const n of nodes) {
      let el = n.parentElement;
      for (let i = 0; el && i < 5; i++) el = el.parentElement;
      if (el) el.style.display = "none";
    }
  }

  function addShortcut(id, label, sub, href, emoji) {
    if (document.getElementById(id)) return;
    const serviceTitle = Array.from(document.querySelectorAll("div,span")).find(el => (el.textContent || "").trim() === "الخدمات");
    const container = serviceTitle?.parentElement?.parentElement?.nextElementSibling || serviceTitle?.closest("div")?.parentElement;
    if (!container) return;
    const card = document.createElement("button");
    card.id = id;
    card.type = "button";
    card.dir = "rtl";
    card.onclick = () => { location.href = href; };
    card.style.cssText = "width:31%;min-width:120px;min-height:118px;margin:6px;border-radius:22px;border:1px solid rgba(0,155,103,.22);background:linear-gradient(145deg,rgba(0,155,103,.12),rgba(255,194,10,.10));color:#10231b;font-family:inherit;box-shadow:0 10px 28px rgba(0,0,0,.08);display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;vertical-align:top;";
    card.innerHTML = `<span style="font-size:22px">${emoji}</span><strong style="font-size:13px;line-height:1.4">${label}</strong><small style="font-size:10px;opacity:.72;line-height:1.4">${sub}</small>`;
    container.prepend(card);
  }

  function patch() {
    replaceTexts();
    hideDesignNote();
    addShortcut("hs-lawyers-shortcut", "المحامون", "استشارات · عقود", "/lawyers", "⚖️");
    addShortcut("hs-admin-shortcut", "الإدارة والإشراف", "دخول المشرفين", "/admin", "🛡️");
    addShortcut("hs-inst-shortcut", "بوابة المؤسسات", "المؤسسات والشركاء", "/inst-portal", "🏢");
  }

  patch();
  let count = 0;
  const timer = setInterval(() => {
    patch();
    if (++count > 30) clearInterval(timer);
  }, 500);
})();
</script>`;

function injectPatch(html) {
  if (html.includes("hasahisawi-web-hotfix-20260626")) return html;
  return html.replace("</body>", `${DOM_PATCH}</body>`);
}

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const accept = e.request.headers.get("accept") || "";
  const isNavigation = e.request.mode === "navigate" || accept.includes("text/html");

  if (isNavigation) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(async r => {
          const html = await r.clone().text();
          const patched = injectPatch(html);
          const response = new Response(patched, {
            status: r.status,
            statusText: r.statusText,
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" }
          });
          caches.open(CACHE).then(c => c.put(e.request, response.clone())).catch(() => {});
          return response;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match("/")))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("/")))
  );
});
