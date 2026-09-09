import asyncio
from contextlib import asynccontextmanager

from app.core.logging import logger
from app.core.paths import no_links
from app.core.rag_facade import Readiness, load_facade


def service_lifespan(settings, facade=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.rag = None
        app.state.started = False
        try:
            app.state.rag = facade if facade is not None else load_facade(settings.rag_factory)
            no_links(settings.cache_dir).mkdir(parents=True, exist_ok=True)
            await asyncio.wait_for(app.state.rag.startup(settings.cache_dir), settings.lifecycle_timeout_sec)
            app.state.started = True
            logger.info("service_started")
        except Exception:
            # Never log exception text/tracebacks supplied by a dependency.
            logger.error("dependency_startup_failed")
        try:
            yield
        finally:
            app.state.started = False
            if app.state.rag is not None:
                try:
                    await asyncio.wait_for(app.state.rag.shutdown(), settings.lifecycle_timeout_sec)
                except Exception:
                    logger.error("dependency_shutdown_failed")
            logger.info("service_stopped")
    return lifespan


async def readiness(app):
    if not app.state.started:
        return Readiness()
    try:
        result = await asyncio.wait_for(app.state.rag.readiness(), app.state.settings.request_timeout_sec)
        if not isinstance(result, Readiness):
            raise TypeError("Invalid readiness")
        return result
    except Exception:
        logger.error("dependency_readiness_failed")
        return Readiness()
