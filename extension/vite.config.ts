import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));
const googleOAuthScope = "https://www.googleapis.com/auth/generative-language.retriever";
const googleClientIdPattern = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

function configureOAuthManifest(clientId: string): Plugin {
  return {
    apply: "build",
    async closeBundle() {
      const manifestPath = resolve(rootDirectory, "dist/manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
      if (!clientId) {
        delete manifest.oauth2;
        console.warn(
          "Google OAuth disabled: set VITE_YALA_GOOGLE_OAUTH_CLIENT_ID before building.",
        );
      } else {
        if (!googleClientIdPattern.test(clientId)) {
          throw new Error("VITE_YALA_GOOGLE_OAUTH_CLIENT_ID is not a valid Google OAuth client ID.");
        }
        manifest.oauth2 = {
          client_id: clientId,
          scopes: [googleOAuthScope],
        };
      }
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    },
    name: "configure-google-oauth-manifest",
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDirectory, "VITE_YALA_");
  const oauthClientId = env.VITE_YALA_GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";

  return {
    plugins: [react(), configureOAuthManifest(oauthClientId)],
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
