import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const distribution = resolve("dist");
const manifestPath = resolve(distribution, "manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error("Build verification failed: dist/manifest.json is missing.");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const permissions = new Set(manifest.permissions ?? []);
if (!permissions.has("sidePanel")) {
  throw new Error("Build verification failed: manifest permission sidePanel is missing.");
}
for (const forbiddenPermission of ["identity", "identity.email"]) {
  if (permissions.has(forbiddenPermission)) {
    throw new Error(`Build verification failed: obsolete permission ${forbiddenPermission} is present.`);
  }
}
if (manifest.oauth2) {
  throw new Error("Build verification failed: obsolete Google OAuth configuration is present.");
}
if (manifest.side_panel?.default_path) {
  throw new Error(
    "Build verification failed: a global side panel would expose the extension outside YouTube.",
  );
}
for (const permission of manifest.host_permissions ?? []) {
  if (/googleapis\.com/iu.test(permission)) {
    throw new Error(`Build verification failed: direct Google API host ${permission} is present.`);
  }
}
if (
  manifest.key !== undefined &&
  (!/^(?=.{64,4096}$)[A-Za-z0-9+/]+={0,2}$/u.test(manifest.key) || manifest.key.length % 4 !== 0)
) {
  throw new Error("Build verification failed: manifest public key is invalid.");
}
const actionIcon = manifest.action?.default_icon;
const iconPaths = [
  ...Object.values(manifest.icons ?? {}),
  ...(typeof actionIcon === "string" ? [actionIcon] : Object.values(actionIcon ?? {})),
];
const requiredPaths = [
  ...new Set(
    [
      "index.html",
      manifest.background?.service_worker,
      ...(manifest.content_scripts?.flatMap((entry) => entry.js ?? []) ?? []),
      ...iconPaths,
    ].filter((value) => typeof value === "string"),
  ),
];

for (const relativePath of requiredPaths) {
  if (!existsSync(resolve(distribution, relativePath))) {
    throw new Error(`Build verification failed: ${relativePath} is missing.`);
  }
}

for (const entry of manifest.content_scripts ?? []) {
  for (const relativePath of entry.js ?? []) {
    const source = readFileSync(resolve(distribution, relativePath), "utf8");
    if (/(^|;)\s*(import|export)\s/m.test(source)) {
      throw new Error(
        `Build verification failed: ${relativePath} contains ESM syntax but manifest content scripts are classic scripts.`,
      );
    }
  }
}

console.log(`Verified Chrome extension build (${requiredPaths.length} runtime entries).`);
