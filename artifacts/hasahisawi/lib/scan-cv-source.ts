/**
 * محرّك الماسح (JavaScript خالص على Canvas) — يُنفَّذ كما هو في المتصفح، وداخل WebView مخفي على الهاتف.
 *  • detect: يجد الورقة (أكبر منطقة فاتحة متصلة) ويستخرج زواياها الأربع حتى لو كانت مائلة.
 *  • process: تصحيح المنظور (Homography) إلى مستطيل مستوٍ + إزالة الظلال وتفاوت الإضاءة
 *    بقسمة كل بكسل على خلفية الورقة المقدَّرة محلياً، ثم ضبط المستويات حسب الوضع:
 *    document (ملوّن نظيف) · gray (رمادي واضح) · bw (أبيض وأسود حاد) · vivid (ألوان زاهية) · original.
 * الزوايا تُمرَّر مطبَّعة (0..1) بالترتيب: أعلى يسار، أعلى يمين، أسفل يمين، أسفل يسار.
 */
export const SCAN_CV_SOURCE = String.raw`
(function () {
  if (window.HScan) return;
  function load(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      if (!/^data:|^blob:/.test(src)) im.crossOrigin = "anonymous";
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("تعذّرت قراءة الصورة")); };
      im.src = src;
    });
  }
  function mk(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function draw(im, maxSide) {
    var s = Math.min(1, maxSide / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height));
    var w = Math.max(1, Math.round((im.naturalWidth || im.width) * s)), h = Math.max(1, Math.round((im.naturalHeight || im.height) * s));
    var c = mk(w, h), ctx = c.getContext("2d");
    ctx.drawImage(im, 0, 0, w, h);
    return { c: c, ctx: ctx, w: w, h: h };
  }
  function lum(d, n) {
    var g = new Float32Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return g;
  }
  // تمويه صندوقي منفصل (أفقي ثم عمودي) بمجاميع متحركة
  function blur(src, w, h, r) {
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, acc, k = 2 * r + 1;
    for (y = 0; y < h; y++) {
      var row = y * w; acc = 0;
      for (x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
      for (x = 0; x < w; x++) {
        tmp[row + x] = acc / k;
        acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0;
      for (y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (y = 0; y < h; y++) {
        out[y * w + x] = acc / k;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }
  function otsu(g) {
    var hist = new Float64Array(256), n = g.length, i;
    for (i = 0; i < n; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, t = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      var wF = n - wB; if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  }
  function quadArea(q) {
    var a = 0;
    for (var i = 0; i < 4; i++) { var p = q[i], n = q[(i + 1) % 4]; a += p[0] * n[1] - n[0] * p[1]; }
    return Math.abs(a) / 2;
  }

  // ── كشف الورقة ──
  function detect(src) {
    return load(src).then(function (im) {
      var D = draw(im, 520), w = D.w, h = D.h, n = w * h;
      var g = blur(blur(lum(D.ctx.getImageData(0, 0, w, h).data, n), w, h, 2), w, h, 2);
      var t = otsu(g);
      var mask = new Uint8Array(n), i;
      for (i = 0; i < n; i++) mask[i] = g[i] > t ? 1 : 0;
      // أكبر مكوّن متصل من البكسلات الفاتحة
      var label = new Int32Array(n), stack = new Int32Array(n), best = -1, bestSize = 0, cur = 0, sizes = [];
      for (i = 0; i < n; i++) {
        if (!mask[i] || label[i]) continue;
        cur++; var sp = 0, size = 0; stack[sp++] = i; label[i] = cur;
        while (sp) {
          var p = stack[--sp]; size++;
          var x = p % w, y = (p / w) | 0;
          if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1; }
          if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1; }
          if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w; }
          if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w; }
        }
        sizes[cur] = size;
        if (size > bestSize) { bestSize = size; best = cur; }
      }
      if (best < 0 || bestSize < n * 0.12) return { corners: null, reason: "small" };
      // الزوايا من القيم القصوى لـ x+y و x−y (تعمل مع الورقة المائلة والمنظور)
      var tl = [0, 0], tr = [0, 0], br = [0, 0], bl = [0, 0];
      var minS = 1e9, maxS = -1e9, minD = 1e9, maxD = -1e9;
      for (i = 0; i < n; i++) {
        if (label[i] !== best) continue;
        var px = i % w, py = (i / w) | 0, s = px + py, d = px - py;
        if (s < minS) { minS = s; tl = [px, py]; }
        if (s > maxS) { maxS = s; br = [px, py]; }
        if (d > maxD) { maxD = d; tr = [px, py]; }
        if (d < minD) { minD = d; bl = [px, py]; }
      }
      var q = [tl, tr, br, bl].map(function (p) { return [p[0] / (w - 1), p[1] / (h - 1)]; });
      var a = quadArea(q);
      if (a < 0.12) return { corners: null, reason: "small" };
      if (a > 0.985) return { corners: null, reason: "full" };
      return { corners: q, area: a };
    });
  }

  // ── تحويل المنظور ──
  function solve(A, b) {
    var n = b.length, i, j, k;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
      var tA = A[i]; A[i] = A[piv]; A[piv] = tA; var tb = b[i]; b[i] = b[piv]; b[piv] = tb;
      for (k = i + 1; k < n; k++) {
        var f = A[k][i] / A[i][i];
        for (j = i; j < n; j++) A[k][j] -= f * A[i][j];
        b[k] -= f * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = b[i]; for (j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return x;
  }
  function homography(from, to) {
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = from[i][0], y = from[i][1], u = to[i][0], v = to[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    return solve(A, b).concat([1]);
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function warp(sd, sw, sh, q, maxSide) {
    var W = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    var k = Math.min(1, maxSide / Math.max(W, H)); W = Math.max(8, Math.round(W * k)); H = Math.max(8, Math.round(H * k));
    var M = homography([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], q);
    var out = new ImageData(W, H), od = out.data, x, y, o = 0;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++, o += 4) {
        var den = M[6] * x + M[7] * y + 1, fx = (M[0] * x + M[1] * y + M[2]) / den, fy = (M[3] * x + M[4] * y + M[5]) / den;
        if (fx < 0) fx = 0; if (fy < 0) fy = 0; if (fx > sw - 1) fx = sw - 1; if (fy > sh - 1) fy = sh - 1;
        var x0 = fx | 0, y0 = fy | 0, x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
        var i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
        for (var c = 0; c < 3; c++) {
          od[o + c] = (sd[i00 + c] * (1 - ax) + sd[i10 + c] * ax) * (1 - ay) + (sd[i01 + c] * (1 - ax) + sd[i11 + c] * ax) * ay;
        }
        od[o + 3] = 255;
      }
    }
    return out;
  }

  // ── إزالة الظلال وتحسين الورقة ──
  function background(L, w, h) {
    // شبكة خشنة: لكل خلية قيمة قريبة من أفتح ما فيها (لون الورقة) بعد تمويه يزيل الحبر
    var B = Math.max(12, Math.round(Math.max(w, h) / 40)), gw = Math.ceil(w / B), gh = Math.ceil(h / B);
    var sm = blur(L, w, h, 2), grid = new Float32Array(gw * gh), gx, gy, x, y;
    for (gy = 0; gy < gh; gy++) for (gx = 0; gx < gw; gx++) {
      var vals = [], x1 = Math.min(w, (gx + 1) * B), y1 = Math.min(h, (gy + 1) * B);
      for (y = gy * B; y < y1; y += 2) for (x = gx * B; x < x1; x += 2) vals.push(sm[y * w + x]);
      vals.sort(function (a, b) { return a - b; });
      grid[gy * gw + gx] = vals.length ? vals[Math.floor(vals.length * 0.9)] : 255;
    }
    grid = blur(grid, gw, gh, 1);
    var bg = new Float32Array(w * h);
    for (y = 0; y < h; y++) {
      var fy = Math.min(gh - 1, Math.max(0, y / B - 0.5)), y0 = fy | 0, y1b = Math.min(gh - 1, y0 + 1), ay = fy - y0;
      for (x = 0; x < w; x++) {
        var fx = Math.min(gw - 1, Math.max(0, x / B - 0.5)), x0 = fx | 0, x1b = Math.min(gw - 1, x0 + 1), ax = fx - x0;
        var v = (grid[y0 * gw + x0] * (1 - ax) + grid[y0 * gw + x1b] * ax) * (1 - ay) + (grid[y1b * gw + x0] * (1 - ax) + grid[y1b * gw + x1b] * ax) * ay;
        bg[y * w + x] = Math.max(40, v);
      }
    }
    return bg;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function enhance(img, mode) {
    if (mode === "original") return img;
    var w = img.width, h = img.height, d = img.data, n = w * h, i, j;
    var L = lum(d, n), bg = background(L, w, h);
    var lo = 0.38, hi = 0.93;
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var k = 1 / bg[i];
      if (mode === "gray" || mode === "bw") {
        var t = clamp01((L[i] * k - lo) / (hi - lo));
        if (mode === "bw") t = t < 0.55 ? 0 : t > 0.68 ? 1 : (t - 0.55) / 0.13;
        else t = Math.pow(t, 1.35);
        d[j] = d[j + 1] = d[j + 2] = t * 255;
      } else {
        var r = clamp01((d[j] * k - lo) / (hi - lo)), g = clamp01((d[j + 1] * k - lo) / (hi - lo)), b = clamp01((d[j + 2] * k - lo) / (hi - lo));
        r = Math.pow(r, 1.25); g = Math.pow(g, 1.25); b = Math.pow(b, 1.25);
        if (mode === "vivid") {
          var m = (r + g + b) / 3, s = 1.4;
          r = clamp01(m + (r - m) * s); g = clamp01(m + (g - m) * s); b = clamp01(m + (b - m) * s);
        }
        d[j] = r * 255; d[j + 1] = g * 255; d[j + 2] = b * 255;
      }
    }
    return img;
  }

  function process(src, corners, mode, maxSide) {
    maxSide = maxSide || 2000;
    return load(src).then(function (im) {
      var D = draw(im, corners ? 2600 : maxSide), img;
      if (corners && corners.length === 4) {
        var q = corners.map(function (p) { return [p[0] * (D.w - 1), p[1] * (D.h - 1)]; });
        img = warp(D.ctx.getImageData(0, 0, D.w, D.h).data, D.w, D.h, q, maxSide);
      } else {
        img = D.ctx.getImageData(0, 0, D.w, D.h);
      }
      img = enhance(img, mode || "document");
      var c = mk(img.width, img.height);
      c.getContext("2d").putImageData(img, 0, 0);
      return c.toDataURL("image/jpeg", 0.9);
    });
  }

  window.HScan = { detect: detect, process: process };
})();
`;
