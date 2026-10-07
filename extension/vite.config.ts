import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));
const extensionPublicKeyPattern = /^(?=.{64,4096}$)[A-Za-z0-9+/]+={0,2}$/;

function gatewayHostPermission(configuredUrl: string): string | undefined {
  if (!configuredUrl) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error("VITE_YALA_GATEWAY_URL must be an absolute URL.");
  }
  const localDevelopment =
    url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localDevelopment) || url.username || url.password) {
    throw new Error("VITE_YALA_GATEWAY_URL must use HTTPS (HTTP is allowed only for localhost). ");
  }
  if (url.search || url.hash) {
    throw new Error("VITE_YALA_GATEWAY_URL cannot contain a query or fragment.");
  }
  return `${url.origin}/*`;
}

function configureExtensionManifest(gatewayUrl: string, publicKey: string): Plugin {
  return {
    apply: "build",
    async closeBundle() {
      const manifestPath = resolve(rootDirectory, "dist/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      delete manifest.oauth2;
      const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
      manifest.permissions = permissions.filter(
        (permission) => permission !== "identity" && permission !== "identity.email",
      );

      const gatewayPermission = gatewayHostPermission(gatewayUrl);
      const hostPermissions = Array.isArray(manifest.host_permissions)
        ? manifest.host_permissions.filter(
            (permission) =>
              typeof permission === "string" &&
              !permission.includes("googleapis.com") &&
              !permission.includes("generativelanguage.googleapis.com"),
          )
        : [];
      if (gatewayPermission && !hostPermissions.includes(gatewayPermission)) {
        hostPermissions.push(gatewayPermission);
      }
      manifest.host_permissions = hostPermissions;
      if (!gatewayPermission) {
        console.warn("AI Gateway is not configured: set VITE_YALA_GATEWAY_URL before packaging.");
      }

      if (!publicKey) {
        delete manifest.key;
      } else {
        if (
          !extensionPublicKeyPattern.test(publicKey) ||
          publicKey.length % 4 !== 0
        ) {
          throw new Error("VITE_YALA_EXTENSION_PUBLIC_KEY is not valid base64 public-key data.");
        }
        manifest.key = publicKey;
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    },
    name: "configure-extension-manifest",
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDirectory, "VITE_YALA_");
  const gatewayUrl = env.VITE_YALA_GATEWAY_URL?.trim() ?? "";
  const publicKey = env.VITE_YALA_EXTENSION_PUBLIC_KEY?.trim() ?? "";

  return {
    plugins: [react(), configureExtensionManifest(gatewayUrl, publicKey)],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(rootDirectory, "index.html"),
          background: resolve(rootDirectory, "src/background/index.ts"),
          content: resolve(rootDirectory, "src/content/index.ts"),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === "background" || chunk.name === "content"
              ? "assets/[name].js"
              : "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
    test: {
      environment: "jsdom",
      include: ["src/tests/**/*.test.{ts,tsx}"],
      setupFiles: "./src/tests/setup.ts",
    },
  };
});
