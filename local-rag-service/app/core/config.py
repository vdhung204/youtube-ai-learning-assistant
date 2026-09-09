import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from app.core.paths import no_links


SERVICE_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8765
    data_dir: Path = field(default_factory=lambda: SERVICE_ROOT / "data")
    allowed_origins: tuple[str, ...] = ()
    max_body_bytes: int = 2 * 1024 * 1024
    request_timeout_sec: float = 30.0
    lifecycle_timeout_sec: float = 120.0
    max_results_limit: int = 20  # Transport ceiling, NOT the retrieval top-k.
    rag_factory: str = ""

    def __post_init__(self):
        if self.host != "127.0.0.1":
            raise ValueError("Service host must be 127.0.0.1")
        if not 1 <= self.port <= 65535:
            raise ValueError("Port must be between 1 and 65535")
        if self.max_body_bytes <= 0 or self.max_results_limit <= 0:
            raise ValueError("Input limits must be positive")
        if not 0 < self.request_timeout_sec <= 3600 or not 0 < self.lifecycle_timeout_sec <= 3600:
            raise ValueError("Timeouts must be between 0 and 3600 seconds")
        for origin in self.allowed_origins:
            if not re.fullmatch(r"chrome-extension://[a-p]{32}", origin):
                raise ValueError("Origins must be explicit Chrome extension origins")
        root = no_links(SERVICE_ROOT / "data").resolve()
        target = no_links(self.data_dir).resolve()
        if target != root and root not in target.parents:
            raise ValueError("Data directory must be inside local-rag-service/data")
        object.__setattr__(self, "data_dir", target)

    @property
    def cache_dir(self) -> Path:
        return Path(self.data_dir) / "chroma"

    @classmethod
    def from_env(cls):
        return cls(
            host=os.getenv("YALA_HOST", "127.0.0.1"),
            port=int(os.getenv("YALA_PORT", "8765")),
            data_dir=Path(os.getenv("YALA_DATA_DIR", str(SERVICE_ROOT / "data"))),
            allowed_origins=tuple(x.strip() for x in os.getenv("YALA_ALLOWED_ORIGINS", "").split(",") if x.strip()),
            max_body_bytes=int(os.getenv("YALA_MAX_BODY_BYTES", "2097152")),
            request_timeout_sec=float(os.getenv("YALA_REQUEST_TIMEOUT_SEC", "30")),
            lifecycle_timeout_sec=float(os.getenv("YALA_LIFECYCLE_TIMEOUT_SEC", "120")),
            max_results_limit=int(os.getenv("YALA_MAX_RESULTS_LIMIT", "20")),
            rag_factory=os.getenv("YALA_RAG_FACTORY", ""),
        )
