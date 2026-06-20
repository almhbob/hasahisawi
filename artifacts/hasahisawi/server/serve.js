const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "cache-control": statusCode === 200 ? "public, max-age=60" : "no-store",
  });
  res.end(body);
}

function resolveStaticPath(urlPath) {
  const normalized = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = path.join(STATIC_ROOT, normalized === "/" ? "index.html" : normalized);

  if (!candidate.startsWith(STATIC_ROOT)) {
    return null;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }

  const indexPath = path.join(STATIC_ROOT, "index.html");
  return fs.existsSync(indexPath) ? indexPath : null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/healthz" || url.pathname === "/readyz") {
    return send(res, 200, JSON.stringify({ status: "ok" }), "application/json; charset=utf-8");
  }

  if (!fs.existsSync(STATIC_ROOT)) {
    return send(res, 503, "Static build not found. Run pnpm run build first.");
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    return send(res, 404, "Not Found");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const body = fs.readFileSync(filePath);
  send(res, 200, body, contentType);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving Hasahisawi web build from ${STATIC_ROOT} on port ${port}`);
});
