import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const distribution = resolve("dist");
const manifestPath = resolve(distribution, "manifest.json");

if (!existsSync(manifestPath)) {
  throw new Error("Build verification failed: dist/manifest.json is missing.");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const permissions = new Set(manifest.permissions ?? []);
for (const permission of ["identity", "identity.email", "sidePanel"]) {
  if (!permissions.has(permission)) {
    throw new Error(`Build verification failed: manifest permission ${permission} is missing.`);
  }
}
if (manifest.oauth2) {
  if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(manifest.oauth2.client_id ?? "")) {
    throw new Error("Build verification failed: manifest OAuth client ID is invalid.");
  }
  if (
    !manifest.oauth2.scopes?.includes(
      "https://www.googleapis.com/auth/generative-language.retriever",
    )
  ) {
    throw new Error("Build verification failed: Gemini OAuth scope is missing.");
  }
}
const actionIcon = manifest.action?.default_icon;
const iconPaths = [
  ...Object.values(manifest.icons ?? {}),
  ...(typeof actionIcon === "string" ? [actionIcon] : Object.values(actionIcon ?? {})),
];
const requiredPaths = [
  ...new Set(
    [
      manifest.side_panel?.default_path,
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
