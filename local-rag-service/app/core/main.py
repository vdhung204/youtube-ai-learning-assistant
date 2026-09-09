from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.core.config import Settings
from app.core.errors import ERRORS, ServiceError, error_body
from app.core.lifecycle import service_lifespan
from app.core.logging import logger
from app.transport.middleware import RequestGuard
from app.transport.routes import router


def create_app(settings=None, facade=None):
    settings = settings or Settings.from_env()
    app = FastAPI(title="YouTube AI Learning Assistant — Local Service", version="0.1.0",
                  lifespan=service_lifespan(settings, facade), docs_url="/docs", redoc_url=None)
    app.state.settings = settings

    @app.exception_handler(ServiceError)
    async def service_error(request, exc):
        return JSONResponse(error_body(exc.code), status_code=ERRORS[exc.code][0])

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        code = "INVALID_REQUEST"
        errors = exc.errors()
        # Inspect only fixed locations, never return input values or validator messages.
        if any(e["type"] == "extra_forbidden" or e["loc"] == ("body", "video") for e in errors):
            code = "INVALID_REQUEST"
        elif request.url.path.endswith("/index") and any(
                e["loc"] == ("body",) or "transcriptSegments" in e["loc"] for e in errors):
            code = "TRANSCRIPT_INVALID"
        elif request.url.path.endswith("/retrieve") and any("query" in e["loc"] for e in errors):
            code = "QUERY_INVALID"
        elif request.url.path.endswith("/assessments/quiz"):
            code = "QUIZ_INVALID"
        return JSONResponse(error_body(code), status_code=400)

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "INVALID_REQUEST")
        return JSONResponse(error_body(code), status_code=ERRORS[code][0])

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        logger.error("unhandled_service_error")
        return JSONResponse(error_body("INTERNAL_ERROR"), status_code=500)

    app.include_router(router)

    def openapi():
        if app.openapi_schema is None:
            schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
            # Validation errors use our 400 envelope, not FastAPI's default 422.
            for path in schema["paths"].values():
                for operation in path.values():
                    operation.get("responses", {}).pop("422", None)
            app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = openapi
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins),
                       allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"],
                       allow_credentials=False)
    app.add_middleware(RequestGuard, settings=settings)
    return app


if __name__ == "__main__":
    import uvicorn
    config = Settings.from_env()
    uvicorn.run(create_app(config), host=config.host, port=config.port, access_log=False,
                log_level="critical", proxy_headers=False, timeout_graceful_shutdown=30)
