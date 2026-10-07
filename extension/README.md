# YouTube AI Learning Assistant Extension

React + TypeScript Chrome Extension (Manifest V3) rendered in Chrome's Side Panel.

## Development

Requirements: Node.js 20 or newer and npm.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Set `VITE_YALA_GATEWAY_URL` in `.env.local` before making a distributable build. See
[AI Gateway configuration](#ai-gateway-configuration).

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
The Side Panel is disabled globally and enabled only for individual `https://www.youtube.com`
tabs. If the user switches to another site, Chrome hides/disables the panel for that tab; returning
to YouTube makes it available again.

After each build, reload the unpacked extension and refresh the active YouTube tab so Chrome injects the latest content script.

## Frontend structure

- `src/sidebar`: application shell, shared UI, presentation helpers, state hooks, and page views.
- `src/features`: cohesive Quiz, Flashcard, and assessment screens.
- `src/integrations`: typed adapters for Chrome/YouTube, AI Gateway, and Local RAG.
- `src/types`: contracts shared across runtime boundaries; runtime payloads are still validated.
- `src/ai-content`: independently owned request builders, grounding validators, and trusted timestamp mappers.

Small one-use view components live with their owning view. Reusable controls live in
`sidebar/components/ui.tsx`, while integration and security boundaries remain separate modules.

## AI Gateway configuration

The extension does not use `chrome.identity`, Google OAuth, or a provider API key. It sends a
strict business request to the project's AI Gateway; the gateway owns the Gemini key, model,
prompt, output schema, validation, and provider retries. End users do not enter credentials and
do not register their machine or Extension ID with Google Cloud.

Create `extension/.env.local` from `.env.example`:

```dotenv
VITE_YALA_GATEWAY_URL=https://your-gateway.vercel.app
```

The value is the gateway base URL; the client resolves its `/api/generate` endpoint. Production
must use HTTPS. `http://localhost` and `http://127.0.0.1` are accepted only for local development.
The build injects only the matching gateway origin into `dist/manifest.json`; it does not grant
host access to Google APIs.

For a stable ID while repeatedly loading an unpacked build, set the optional base64 public
manifest key as `VITE_YALA_EXTENSION_PUBLIC_KEY` (see `.env.example`). A Chrome Web Store release already has one stable Extension ID, so
the gateway operator configures its origin once and every user installs the same build without
submitting an ID. Never put a private signing key, Gemini key, token, or cookie in an extension
environment variable; every `VITE_...` value is public in the bundle.

The gateway uses an exact extension-origin allowlist as defense in depth. CORS is not user
authentication and does not stop scripts outside a browser from calling a public endpoint, so a
production deployment also needs distributed rate limiting, Gemini quota/budget alerts, and key
rotation. Gateway setup is documented in [`../gateway/README.md`](../gateway/README.md); the full
trust boundary is in [`../docs/architecture/ai-gateway.md`](../docs/architecture/ai-gateway.md).

Requests to both the gateway and Local RAG Service use `credentials: "omit"`; no cookies,
Google tokens, or API keys are sent by the extension.

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
- AI generation through a server-owned gateway with strict task contracts, bounded retries, cancellation, and sanitized errors
- No Google login, `chrome.identity`, direct Gemini host permission, or provider key in the extension bundle

No sample learning data is imported by the production runtime.
