/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_YALA_EXTENSION_PUBLIC_KEY?: string;
  readonly VITE_YALA_GATEWAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
