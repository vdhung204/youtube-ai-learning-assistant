# YALA AI Gateway

Server-side Gemini gateway for the YouTube AI Learning Assistant extension. The extension sends a
strict learning-task payload; the gateway owns the Gemini key, model, system instructions, output
schema, validation, retry policy, and rate limit. It is intentionally **not** a general-purpose prompt
proxy.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/generate` | Generate questions, flashcards, an answer, or assessment feedback. |
| `OPTIONS` | `/api/generate` | Chrome extension CORS preflight. |
| `GET` | `/api/health` | Configuration/readiness check; it does not call Gemini. |

Successful generation:

```json
{
  "data": {
    "status": "ok",
    "items": []
  },
  "meta": {
    "requestId": "73372845-f6a9-41fe-b6e0-f4be5a412626"
  }
}
```

Insufficient transcript evidence is a successful HTTP response:

```json
{
  "data": {
    "status": "insufficient_context",
    "items": []
  },
  "meta": {
    "requestId": "73372845-f6a9-41fe-b6e0-f4be5a412626"
  }
}
```

All failures use one contract:

```json
{
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "The AI provider is temporarily unavailable.",
    "retryable": true,
    "requestId": "73372845-f6a9-41fe-b6e0-f4be5a412626"
  }
}
```

Provider response bodies are never forwarded to the extension.

## Request contract

Send `Content-Type: application/json`. `language` is an optional BCP-47-like tag and defaults to
`en`. Unknown fields are rejected. In particular, the API never accepts a model, system prompt,
generation settings, or response schema from the client.

The shared `context` object is:

```json
{
  "videoId": "abcdefghijk",
  "durationSec": 600,
  "chunks": [
    {
      "chunkId": "36e2c4...",
      "videoId": "abcdefghijk",
      "text": "A transcript excerpt selected by local retrieval.",
      "startSec": 42,
      "endSec": 55,
      "position": 1,
      "score": 0.92
    }
  ]
}
```

### Questions

`requestedCount` is 1-10. A successful `ok` result contains exactly this many validated items.

```json
{
  "task": "questions",
  "language": "vi",
  "requestedCount": 6,
  "context": { "videoId": "abcdefghijk", "durationSec": 600, "chunks": ["..."] }
}
```

`context` is abbreviated above; use the complete shared context object shown earlier.

Each item contains `question`, four unique `options`, a zero-based `correctAnswer`, `explanation`,
`topic`, `sourceChunkId`, and an exact `evidence` quote.

### Flashcards

`requestedCount` is 1-10. A successful `ok` result also contains exactly this many items.

```json
{
  "task": "flashcards",
  "language": "vi",
  "requestedCount": 6,
  "context": { "videoId": "abcdefghijk", "durationSec": 600, "chunks": ["..."] }
}
```

`context` is abbreviated above.

Each item contains `front`, `back`, `topic`, `sourceChunkId`, and `evidence`.

### Answer

The server asks Gemini for up to three grounded answer paragraphs.

```json
{
  "task": "answers",
  "language": "vi",
  "question": "Vì sao tuple là immutable?",
  "context": { "videoId": "abcdefghijk", "durationSec": 600, "chunks": ["..."] }
}
```

`context` is abbreviated above.

Each item contains `answer`, `topic`, `sourceChunkId`, and `evidence`.

### Feedback

The assessment is local, trusted application data. Its score and topic classification are validated
again at the gateway. Gemini may discuss them but cannot change them.

```json
{
  "task": "feedback",
  "language": "vi",
  "context": { "videoId": "abcdefghijk", "durationSec": 600, "chunks": ["..."] },
  "assessment": {
    "score": 50,
    "correctCount": 1,
    "totalCount": 2,
    "questionResults": [
      {
        "questionId": "q1",
        "correct": true,
        "correctAnswer": 0,
        "selectedAnswer": 0
      },
      {
        "questionId": "q2",
        "correct": false,
        "correctAnswer": 1,
        "selectedAnswer": 2
      }
    ],
    "strongTopics": ["Tuple"],
    "weakTopics": ["List"],
    "reviewTimestamps": [
      {
        "chunkId": "chunk-1",
        "startSec": 42,
        "endSec": 55,
        "topic": "List",
        "reason": "Review the missed question."
      }
    ]
  }
}
```

`context` is abbreviated above.

Each feedback item contains `comment`, `topic`, `sourceChunkId`, and `evidence`. The topic must be in
the assessment's strong or weak topic set.

## Limits and validation

- Request body: 64 KiB.
- Transcript: 1-12 chunks, at most 5,000 characters each and 20,000 UTF-8 bytes in total.
- Video ID: an 11-character YouTube ID; duration is at most 48 hours.
- Question: at most 2,000 characters.
- Question/flashcard batch: at most 10 items.
- Provider response: at most 512 KiB.
- Every generated item must cite an existing chunk and an exact evidence substring.
- Unknown/extra fields, duplicate content, incorrect item counts, invalid JSON, and unsupported
  sources are rejected.

The provider call, JSON parse, grounding check, and semantic validation are one retried operation.
That means a syntactically valid but short or ungrounded model response is retried just like malformed
JSON. The total deadline is shared by all attempts; retries do not each receive a fresh timeout.

## Configuration

Copy `.env.example` to `.env.local` for local development. Configure the same names in Vercel under
Project Settings -> Environment Variables.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | - | Server-only Google AI Studio key. |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Server-selected model; never client-selectable. |
| `ALLOWED_EXTENSION_ORIGINS` | Yes | - | Comma-separated exact `chrome-extension://<id>` origins. |
| `GEMINI_TIMEOUT_MS` | No | `25000` | Total generation deadline across all attempts; max 28 seconds. |
| `GEMINI_MAX_RETRIES` | No | `1` | Retry count after the first attempt; range 0-3. Long provider `Retry-After` values are returned to the caller without waiting. |
| `UPSTASH_REDIS_REST_URL` | No | - | Upstash REST endpoint. Must be paired with the token. |
| `UPSTASH_REDIS_REST_TOKEN` | No | - | Upstash REST token. Must be paired with the URL. |
| `RATE_LIMIT_MAX_REQUESTS` | No | `20` | Requests allowed per public IP/window. |
| `RATE_LIMIT_WINDOW_SECONDS` | No | `60` | Fixed-window duration; range 10-86,400 seconds. |

Do not prefix a secret with `VITE_`: Vite exposes those variables in the extension bundle.

Use the stable Chrome Web Store extension ID in `ALLOWED_EXTENSION_ORIGINS`. Every installed copy of
that listing has the same ID, so users do not send an ID and do not need to be registered individually.
For unpacked development, use a stable manifest key/ID or add the developer extension origin to the
comma-separated value.

## Rate limiting and abuse controls

When both Upstash variables are absent, distributed rate limiting is disabled. This is convenient for
local development but is not recommended for a public deployment. When configured, the gateway uses
Vercel's trusted forwarded public client IP and stores only its origin-scoped SHA-256 hash as a Redis
key. It does not trust a client-selected installation ID, which could be rotated to bypass a limit.

The Upstash path deliberately **fails closed**: a timeout, malformed reply, or unavailable Redis
service returns `RATE_LIMIT_UNAVAILABLE` and Gemini is not called. This prevents a rate-limit outage
from turning into unlimited provider spend. Also set Vercel Firewall rules and Google billing/quota
alerts. IP limiting and CORS are abuse deterrents, not user authentication; a public endpoint can still
be called outside the extension. Paid plans should use real accounts and server-issued sessions.

## Local development and tests

```bash
cd gateway
npm install
npm run check
npm run dev
```

`npm run dev` starts Vercel's local runtime. Test readiness with:

```bash
curl http://localhost:3000/api/health
```

The test suite covers strict input contracts, prompt-control rejection, source grounding, exact output
counts, CORS, normalized errors, transient retries, and retries after invalid model JSON/semantics.

## Deploy

1. Create a Vercel project whose root directory is `gateway`.
2. Add the production environment variables. Keep `GEMINI_API_KEY` and the Upstash token secret.
3. Run `npm run deploy`, or connect the repository and deploy through Vercel.
4. Set the extension build variable `VITE_YALA_GATEWAY_URL` to
   `https://<your-project>.vercel.app` and rebuild it. The Vite build derives/injects the matching
   `host_permissions` entry.
5. Verify the built manifest contains `https://<your-project>.vercel.app/*`.
6. Keep the extension request timeout above the gateway's 30-second Vercel duration (35 seconds is a
   reasonable default) and avoid multiplying retries at both layers.

The function uses Gemini's current Interactions API with structured JSON output, `store: false`, a
server-owned system instruction, and low thinking level. It never logs transcripts, prompts, generated
provider output, API keys, or Upstash tokens. Safe latency logs contain only request ID, task, stage,
attempt, duration, normalized outcome, and provider HTTP status.
