"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { APP_ORIGIN, APP_URL, CSP, resolveAssetPath, createAssetHandler, isExternalUrl,
  isAllowedRequest, downloadName, isAllowedDownload, MAX_DOWNLOAD_BYTES } = require("./security.cjs");

test("protocol only resolves bundled files, rejecting traversal and Windows special paths", () => {
  const root = path.resolve("fixture-studio");
  assert.equal(resolveAssetPath(root, APP_URL), path.join(root, "index.html"));
  assert.equal(resolveAssetPath(root, `${APP_ORIGIN}/assets/main.js`), path.join(root, "assets", "main.js"));
  for (const url of ["file:///C:/Users/private.png", "mingstudio://other/index.html",
    "mingstudio://app:80/index.html", "mingstudio://user@app/index.html",
    `${APP_ORIGIN}/%2e%2e%2fsecret.png`, `${APP_ORIGIN}/a/%2e%2e%5csecret.png`,
    `${APP_ORIGIN}/C%3a%5csecret.png`, `${APP_ORIGIN}/image.png%3asecret`,
    `${APP_ORIGIN}/%00.png`, `${APP_ORIGIN}/bad%zz.png`, `${APP_ORIGIN}/main.cjs`]) {
    assert.equal(resolveAssetPath(root, url), null, url);
  }
});

test("asset handler returns exact contents, CSP, correct MIME and HTTP errors", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ming-assets-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "index.html"), "<main>Ming</main>");
  const handler = createAssetHandler(root);
  const result = await handler({ method: "GET", url: APP_URL });
  assert.equal(result.status, 200);
  assert.equal(await result.text(), "<main>Ming</main>");
  assert.equal(result.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(result.headers.get("content-security-policy"), CSP);
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(await (await handler({ method: "HEAD", url: APP_URL })).text(), "");
  assert.equal((await handler({ method: "POST", url: APP_URL })).status, 405);
  assert.equal((await handler({ method: "GET", url: `${APP_ORIGIN}/missing.png` })).status, 404);
  assert.equal((await handler({ method: "GET", url: "file:///private.png" })).status, 403);
});

test("network and external links cannot escape their explicit HTTPS allowlists", () => {
  assert.equal(isExternalUrl("https://openrouter.ai/inclusionai/ming-image-0.1-design"), true);
  assert.equal(isExternalUrl("https://github.com/sggg221/ming-image-studio"), true);
  for (const url of ["http://openrouter.ai/", "https://openrouter.ai.evil.example/", "https://openrouter.ai:8443/",
    "https://password@openrouter.ai/", "file:///C:/Windows/cmd.exe", "javascript:alert(1)", "https://evil.example/"]) {
    assert.equal(isExternalUrl(url), false, url);
  }
  assert.equal(isAllowedRequest("https://openrouter.ai/api/v1/images"), true);
  for (const model of ["design", "design-layer"]) assert.equal(isAllowedRequest(`https://openrouter.ai/api/v1/images/models/inclusionai/ming-image-0.1-${model}/endpoints`), true);
  for (const url of ["https://openrouter.ai/api/v1/keys", "https://openrouter.ai/api/v1/chat/completions",
    "https://evil.example/api/v1/images", "https://github.com/", "http://openrouter.ai/api/v1/images",
    "https://key@openrouter.ai/api/v1/images", "file:///C:/private.png"]) assert.equal(isAllowedRequest(url), false, url);
});

test("native downloads accept only application-origin PNG and ZIP blobs with bounded size", () => {
  const png = { url: `blob:${APP_ORIGIN}/e43beb68-59c7-4d6a-a6c3-a97a99a260cb`,
    initiatorOrigin: APP_ORIGIN, filename: "ming-design.png", mimeType: "image/png", totalBytes: 100 };
  assert.equal(isAllowedDownload(png), true);
  assert.equal(isAllowedDownload({ ...png, filename: "layers.zip", mimeType: "application/zip" }), true);
  for (const patch of [{ initiatorOrigin: "https://evil.example" }, { url: "blob:https://evil.example/id" },
    { url: "https://openrouter.ai/image.png" }, { filename: "program.exe" }, { mimeType: "text/html" },
    { totalBytes: MAX_DOWNLOAD_BYTES + 1 }, { totalBytes: -1 }, { totalBytes: NaN }]) {
    assert.equal(isAllowedDownload({ ...png, ...patch }), false);
  }
  assert.equal(downloadName("CON.png"), "ming-CON.png");
  assert.equal(downloadName("unsafe/name.png"), "unsafe-name.png");
  assert.equal(downloadName("program.exe"), null);
});
