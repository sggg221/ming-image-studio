"use strict";

// Verify the unpacked release without launching an app or contacting an API.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

async function filesBelow(root, relative = "") {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const candidate = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unexpected symbolic link in resource files");
    if (entry.isDirectory()) files.push(...await filesBelow(root, candidate));
    else if (entry.isFile()) files.push(candidate);
  }
  return files.sort();
}

async function main() {
  const projectRoot = path.join(__dirname, "..");
  const unpackedRoot = path.resolve(process.argv[2] || path.join(projectRoot, "releases", "win-unpacked"));
  const sourceRoot = path.join(projectRoot, "dist", "desktop");
  const packagedRoot = path.join(unpackedRoot, "resources", "studio");
  for (const file of ["Ming Image Studio.exe", "resources/app.asar", "icudtl.dat", "resources/studio/index.html"]) {
    const stat = await fs.stat(path.join(unpackedRoot, file));
    if (!stat.isFile() || stat.size === 0) throw new Error(`Missing or empty packaged file: ${file}`);
  }
  const expected = await filesBelow(sourceRoot);
  const actual = await filesBelow(packagedRoot);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Packaged frontend file list differs from the build");
  for (const file of expected) {
    const [source, packaged] = await Promise.all([fs.readFile(path.join(sourceRoot, file)), fs.readFile(path.join(packagedRoot, file))]);
    const hash = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
    if (hash(source) !== hash(packaged)) throw new Error(`Packaged resource differs from the build: ${file}`);
  }
  console.log(`Verified Windows executable, app.asar, Chromium resources and ${expected.length} exact frontend files.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
