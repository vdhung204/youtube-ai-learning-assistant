import asyncio
from starlette.responses import JSONResponse

from app.core.errors import ERRORS, error_body


class RequestGuard:
    """Check origin, credentials and actual streamed bytes before JSON parsing."""

    def __init__(self, app, settings):
        self.app, self.settings = app, settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def reject(code):
            cors = {"Access-Control-Allow-Origin": origins[0], "Vary": "Origin"} if len(origins) == 1 and origins[0] in self.settings.allowed_origins else {}
            await JSONResponse(error_body(code), status_code=ERRORS[code][0], headers=cors)(scope, receive, send)

        headers = {}
        for key, value in scope["headers"]:
            headers.setdefault(key.lower(), []).append(value.decode("latin-1"))
        origins = headers.get(b"origin", [])
        hosts = headers.get(b"host", [])
        if len(hosts) != 1 or hosts[0].split(":")[0] not in ("127.0.0.1", "localhost"):
            return await reject("INVALID_REQUEST")
        # Swagger sends Origin on POST/DELETE even when using the service's own UI.
        # Permit only that exact loopback host+port, not arbitrary localhost apps.
        same_origin = (len(origins) == 1
                       and hosts[0] in (f"127.0.0.1:{self.settings.port}", f"localhost:{self.settings.port}")
                       and origins[0] == f"http://{hosts[0]}")
        if len(origins) > 1 or (origins and origins[0] not in self.settings.allowed_origins and not same_origin):
            return await reject("ORIGIN_NOT_ALLOWED")
        if any(key in headers for key in (b"authorization", b"cookie", b"proxy-authorization", b"x-api-key")):
            return await reject("CREDENTIALS_NOT_ALLOWED")
        # No endpoint uses query parameters; don't accept accidental credentials there.
        if scope.get("query_string"):
            return await reject("INVALID_REQUEST")
        if scope["method"] == "OPTIONS":
            if not origins or headers.get(b"access-control-request-method", [""])[0] not in ("GET", "POST", "DELETE"):
                return await reject("INVALID_REQUEST")
            requested = headers.get(b"access-control-request-headers", [""])[0]
            if any(h.strip().lower() not in ("", "content-type") for h in requested.split(",")):
                return await reject("CREDENTIALS_NOT_ALLOWED")
            return await self.app(scope, receive, send)
        lengths = headers.get(b"content-length", [])
        if lengths:
            if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit():
                return await reject("INVALID_REQUEST")
            if int(lengths[0]) > self.settings.max_body_bytes:
                return await reject("PAYLOAD_TOO_LARGE")
        if scope["method"] == "POST":
            content_types = headers.get(b"content-type", [])
            if len(content_types) != 1 or content_types[0].split(";")[0].strip().lower() != "application/json":
                return await reject("INVALID_REQUEST")
        body = bytearray()
        try:
            async with asyncio.timeout(self.settings.request_timeout_sec):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    body.extend(message.get("body", b""))
                    if len(body) > self.settings.max_body_bytes:
                        return await reject("PAYLOAD_TOO_LARGE")
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            return await reject("REQUEST_TIMEOUT")
        if scope["method"] != "POST" and body:
            return await reject("INVALID_REQUEST")
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
