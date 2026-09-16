# YouTube AI Learning Assistant Extension

React + TypeScript Chrome Extension (Manifest V3) rendered in Chrome's Side Panel.

## Development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run test:all
npm run build
```

## Load the extension in Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the generated `extension/dist` directory.
5. Click the extension toolbar action to open the Side Panel.

The build emits the Side Panel page, Manifest V3 service worker, and YouTube content script into `dist/`.

After each build, reload the unpacked extension and refresh the active YouTube tab so Chrome injects the latest content script.

## Google OAuth and Gemini access

The extension uses `chrome.identity`; it never persists an OAuth access token in `localStorage`,
`chrome.storage`, ChromaDB, or the Local RAG Service. A token exists only transiently in runtime
memory and Chrome Identity's cache, and is sent only to Google's Generative Language API.
Localhost requests continue to use `credentials: "omit"` and do not include `Authorization`,
cookies, or API keys.

Initial development setup:

1. Build and load `extension/dist` once, then copy its ID from `chrome://extensions`.
2. In Google Cloud, enable the **Generative Language API**, configure the OAuth consent screen,
   and add the development Google accounts as test users.
3. Create an OAuth client with application type **Chrome Extension** and use the copied extension
   ID as its Item ID.
4. Copy `.env.example` to `.env.local`, then replace both public identifiers. Never add a client
   secret or access token.
5. Run `npm run build`, reload the extension, and refresh the active YouTube tab.

The OAuth client is injected into `dist/manifest.json` only during a configured build. A build
without `VITE_YALA_GOOGLE_OAUTH_CLIENT_ID` remains loadable and displays a configuration message
instead of opening a broken OAuth flow.

Authentication behavior:

- Opening the side panel performs a non-interactive cached-token check.
- The interactive OAuth window opens only after the user selects **Đăng nhập bằng Google**.
- After authorization, the extension checks that the account can list a Gemini model supporting
  `generateContent`; 401, 403, 429, network, and invalid-response states are shown separately.
- Signing out removes the cached token and account preference from Chrome Identity.
- Local RAG Service health is checked only after Google and Gemini are ready, but the Local RAG
  Service remains deliberately unauthenticated and never receives the Google token.

## Local Service health check

The Side Panel checks `http://127.0.0.1:8765/api/v1/health`. To allow the request:

1. Copy the extension ID shown on `chrome://extensions`.
2. Set `YALA_ALLOWED_ORIGINS` to `chrome-extension://<extension-id>` in the PowerShell session used to start the service.
3. Restart the Local Service after changing the environment variable.

To run the complete local RAG pipeline from the repository root in PowerShell:

```powershell
$env:YALA_ALLOWED_ORIGINS = "chrome-extension://<extension-id>"
.\scripts\setup-local-service.ps1
.\scripts\start-local-service.ps1
```

Replace `<extension-id>` with the ID shown by Chrome. The setup step is only needed for the
first install or after Python dependencies change.

The setup script installs the RAG dependencies and prepares the local embedding model. The start
script selects the bundled RAG facade by default; a successful health check returns HTTP 200 with
both `vectorStoreReady` and `embeddingModelReady` set to `true`.

## Current scope

- Active YouTube video detection, SPA navigation updates, timestamp seeking, and manual/auto-caption extraction
- Transcript indexing with status polling, retry, session cache, stale-request protection, and cancellation on video change
- Ask AI grounded by `review` retrieval and Gemini structured generation
- Quiz and Flashcard generation grounded by purpose-specific retrieval, strict validation, and timestamp mapping
- Quiz assessment through the Local RAG Service, including backend score, topic feedback, and review timestamps
- Explicit loading, no-video, no-transcript, no-context, service-offline, stale, provider-error, and retry states
- Google OAuth tokens kept in memory and sent only to Google's Generative Language API; localhost requests omit credentials

No sample learning data is imported by the production runtime.
