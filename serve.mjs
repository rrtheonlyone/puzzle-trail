// Minimal local dev server that mimics GitHub Pages: serves files from docs/,
// and for any unknown path falls back to 404.html (a copy of index.html) so the
// client-side /<answer> routing works exactly as it will in production.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "docs");
const PORT = 8000;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  // Resolve within DOCS; "/" maps to index.html.
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(DOCS, rel === "/" || rel === "\\" ? "index.html" : rel);

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": TYPES[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    // Unknown path -> SPA fallback (GitHub Pages serves 404.html with a 404 status).
    const body = await readFile(join(DOCS, "404.html"));
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(body);
  }
}).listen(PORT, () => console.log(`Serving docs/ at http://localhost:${PORT}/ (Ctrl+C to stop)`));
