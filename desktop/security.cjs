"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");

const APP_ORIGIN = "mingstudio://app";
const APP_URL = `${APP_ORIGIN}/`;
const MAX_DOWNLOAD_BYTES = 400 * 1024 * 1024;
const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://openrouter.ai blob: data:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function parseUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function isAppUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && url.protocol === "mingstudio:" && url.hostname === "app" &&
    !url.port && !url.username && !url.password);
}

function isExternalUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && url.protocol === "https:" &&
    ["openrouter.ai", "github.com"].includes(url.hostname) &&
    (!url.port || url.port === "443") && !url.username && !url.password);
}

function isAllowedRequest(value) {
  if (isAppUrl(value)) return true;
  if (value.startsWith(`blob:${APP_ORIGIN}/`)) return true;
  if (/^data:(?:image\/png|image\/jpeg|image\/webp);base64,/i.test(value)) return true;
  const url = parseUrl(value);
  return Boolean(url && url.protocol === "https:" && url.hostname === "openrouter.ai" &&
    (!url.port || url.port === "443") && !url.username && !url.password &&
    (url.pathname === "/api/v1/images" ||
      /^\/api\/v1\/images\/models\/inclusionai\/ming-image-0\.1-design(?:-layer)?\/endpoints$/.test(url.pathname)));
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function resolveAssetPath(root, value) {
  if (!isAppUrl(value)) return null;
  const url = new URL(value);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  // Reject Windows separators, alternate data streams, NULs, and traversal segments.
  if (/[\\\0:]/.test(pathname) || pathname.split("/").some((part) => part === ".." || part === ".")) return null;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const filePath = path.resolve(root, relative);
  if (!isPathInside(root, filePath) || !MIME_TYPES[path.extname(filePath).toLowerCase()]) return null;
  return filePath;
}

function createAssetHandler(root) {
  return async (request) => {
    const headers = { "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers });
    const filePath = resolveAssetPath(root, request.url);
    if (!filePath) return new Response(null, { status: 403, headers });
    try {
      // Keep symlinks and Windows junctions inside the packaged resource directory.
      const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(filePath)]);
      if (!isPathInside(realRoot, realFile)) return new Response(null, { status: 403, headers });
      const stat = await fs.stat(realFile);
      if (!stat.isFile()) return new Response(null, { status: 404, headers });
      headers["Content-Type"] = MIME_TYPES[path.extname(realFile).toLowerCase()];
      if (!headers["Content-Type"]) return new Response(null, { status: 403, headers });
      return new Response(request.method === "HEAD" ? null : await fs.readFile(realFile), { headers });
    } catch {
      return new Response(null, { status: 404, headers });
    }
  };
}

function downloadName(filename) {
  const cleaned = String(filename || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "").slice(0, 180);
  const extension = path.extname(cleaned).toLowerCase();
  if (![".png", ".zip"].includes(extension)) return null;
  const stem = path.basename(cleaned, extension);
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? `ming-${cleaned}` : cleaned;
}

function isAllowedDownload({ url, initiatorOrigin, filename, mimeType, totalBytes }) {
  const safeName = downloadName(filename);
  if (!safeName || initiatorOrigin !== APP_ORIGIN || !url.startsWith(`blob:${APP_ORIGIN}/`)) return false;
  if (!Number.isFinite(totalBytes) || totalBytes < 0 || totalBytes > MAX_DOWNLOAD_BYTES) return false;
  const extension = path.extname(safeName).toLowerCase();
  return (extension === ".png" && mimeType === "image/png") ||
    (extension === ".zip" && ["application/zip", "application/octet-stream"].includes(mimeType));
}

module.exports = { APP_ORIGIN, APP_URL, CSP, MIME_TYPES, MAX_DOWNLOAD_BYTES, isAppUrl,
  isExternalUrl, isAllowedRequest, isPathInside, resolveAssetPath, createAssetHandler,
  downloadName, isAllowedDownload };
