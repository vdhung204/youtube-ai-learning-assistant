import asyncio
import re
from contextlib import suppress

from fastapi import APIRouter, Request, Response
from starlette.responses import JSONResponse

from app.core.errors import ServiceError, error_body
from app.core.lifecycle import readiness
from app.core.logging import logger
from app.transport.models import (
    AssessmentRequest, AssessmentResponse, DeleteResponse, ErrorResponse, HealthResponse,
    IndexRequest, IndexResponse, IndexStatusResponse, RetrieveRequest, RetrieveResponse,
)

router = APIRouter(prefix="/api/v1", responses={
    status: {"model": ErrorResponse} for status in (400, 403, 404, 413, 500, 503, 504)
})


def check_video_id(video_id):
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ServiceError("INVALID_VIDEO_ID")


async def invoke(request, method, video_id, model, failure_code, payload=None):
    check_video_id(video_id)
    if not (await readiness(request.app)).ready:
        raise ServiceError("SERVICE_NOT_READY")

    async def disconnected():
        while True:
            message = await request.receive()
            if message["type"] == "http.disconnect":
                return

    async def operation():
        facade_method = getattr(request.app.state.rag, method)
        raw = await facade_method(video_id, payload) if payload is not None else await facade_method(video_id)
        result = model.model_validate(raw)
        if hasattr(result, "videoId") and result.videoId != video_id:
            raise ValueError("Cross-video response")
        if isinstance(result, RetrieveResponse):
            if result.purpose != payload["purpose"] or any(c.videoId != video_id for c in result.chunks):
                raise ValueError("Cross-video context")
            limit = payload.get("maxResults", request.app.state.settings.max_results_limit)
            if len(result.chunks) > limit:
                raise ValueError("Result exceeds transport limit")
            result.reason = None if result.chunks else "NO_RELEVANT_CONTEXT"
        if isinstance(result, IndexStatusResponse) and result.error:
            # Dependency error text is never trusted, even on a 200 status response.
            code = result.error.code
            result.error = ErrorResponse.model_validate(error_body(code if code in ("INDEX_FAILED", "TRANSCRIPT_INVALID", "SERVICE_NOT_READY") else "INDEX_FAILED")).error
        return result

    work = asyncio.create_task(operation())
    cancelled = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait((work, cancelled), timeout=request.app.state.settings.request_timeout_sec,
                                     return_when=asyncio.FIRST_COMPLETED)
        if cancelled in done:
            raise asyncio.CancelledError()
        if work not in done:
            raise ServiceError("REQUEST_TIMEOUT")
        return work.result()
    except ServiceError:
        raise
    except Exception:
        logger.error("rag_operation_failed operation=%s", method)
        raise ServiceError(failure_code) from None
    finally:
        for task in (work, cancelled):
            if not task.done():
                task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await task


@router.get("/health", response_model=HealthResponse, response_model_exclude_none=True,
            responses={503: {"model": HealthResponse}})
async def health(request: Request):
    state = await readiness(request.app)
    result = HealthResponse(status="ready" if state.ready else "not_ready", serviceVersion="0.1.0",
                            pipelineVersion=state.pipeline_version, vectorStoreReady=state.vector_store_ready,
                            embeddingModelReady=state.embedding_model_ready)
    body = result.model_dump(exclude_none=True)
    if not state.ready:
        body.update(error_body("SERVICE_NOT_READY"))
    return JSONResponse(body, status_code=200 if state.ready else 503)


@router.post("/videos/{videoId}/index", response_model=IndexResponse, response_model_exclude_none=True,
             responses={202: {"model": IndexResponse}})
async def index(videoId: str, payload: IndexRequest, request: Request, response: Response):
    check_video_id(videoId)
    if videoId != payload.video.videoId:
        raise ServiceError("VIDEO_ID_MISMATCH")
    result = await invoke(request, "index", videoId, IndexResponse, "INDEX_FAILED", payload.model_dump())
    response.status_code = 200 if result.cached else 202
    return result


@router.get("/videos/{videoId}/index-status", response_model=IndexStatusResponse, response_model_exclude_none=True)
async def index_status(videoId: str, request: Request):
    return await invoke(request, "index_status", videoId, IndexStatusResponse, "INDEX_FAILED")


@router.post("/videos/{videoId}/retrieve", response_model=RetrieveResponse, response_model_exclude_none=True)
async def retrieve(videoId: str, payload: RetrieveRequest, request: Request):
    if payload.maxResults is not None and payload.maxResults > request.app.state.settings.max_results_limit:
        raise ServiceError("INVALID_REQUEST")
    return await invoke(request, "retrieve", videoId, RetrieveResponse, "RETRIEVAL_FAILED", payload.model_dump(exclude_none=True))


@router.post("/videos/{videoId}/assessments/quiz", response_model=AssessmentResponse)
async def assess_quiz(videoId: str, payload: AssessmentRequest, request: Request):
    return await invoke(request, "assess_quiz", videoId, AssessmentResponse, "ASSESSMENT_FAILED", payload.model_dump())


@router.delete("/videos/{videoId}/cache", response_model=DeleteResponse)
async def delete_cache(videoId: str, request: Request):
    return await invoke(request, "delete_cache", videoId, DeleteResponse, "CACHE_DELETE_FAILED")
