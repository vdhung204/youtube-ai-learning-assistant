from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingConfig:
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    revision: str = "e8f8c211226b894fcb81acc59f3b34ba3efd5f42"
    batch_size: int = 16
    device: str = "cpu"
    local_files_only: bool = True

    def __post_init__(self):
        if not self.model_name or not self.revision or self.batch_size < 1:
            raise ValueError("Invalid embedding configuration")
