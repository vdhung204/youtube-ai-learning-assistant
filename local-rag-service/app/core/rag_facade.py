"""Proposed integration seam for TV3; no production mock or RAG algorithm."""
from dataclasses import dataclass
from importlib import import_module
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class Readiness:
    pipeline_version: str = "unconfigured"
    vector_store_ready: bool = False
    embedding_model_ready: bool = False

    @property
    def ready(self):
        return self.vector_store_ready and self.embedding_model_ready


class RagFacade(Protocol):
    async def startup(self, cache_dir: Path) -> None: ...
    async def shutdown(self) -> None: ...
    async def readiness(self) -> Readiness: ...
    async def index(self, video_id: str, payload: dict) -> dict: ...
    async def index_status(self, video_id: str) -> dict: ...
    async def retrieve(self, video_id: str, payload: dict) -> dict: ...
    async def assess_quiz(self, video_id: str, payload: dict) -> dict: ...
    async def delete_cache(self, video_id: str) -> dict: ...


class UnconfiguredRag:
    async def startup(self, cache_dir):
        pass

    async def shutdown(self):
        pass

    async def readiness(self):
        return Readiness()


def load_facade(factory_path: str) -> RagFacade:
    if not factory_path:
        return UnconfiguredRag()
    module, separator, name = factory_path.partition(":")
    if not separator or not module or not name:
        raise ValueError("YALA_RAG_FACTORY must be module:factory")
    return getattr(import_module(module), name)()
