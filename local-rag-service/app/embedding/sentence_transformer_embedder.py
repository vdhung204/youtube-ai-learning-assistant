"""Local inference; model download is explicit via prepare_model, never an API call with transcript."""
from pathlib import Path
from math import isfinite

from .config import EmbeddingConfig


class SentenceTransformerEmbedder:
    def __init__(self, cache_dir: Path, config: EmbeddingConfig = EmbeddingConfig()):
        from huggingface_hub import snapshot_download
        from sentence_transformers import SentenceTransformer

        snapshot = snapshot_download(config.model_name, revision=config.revision,
                                     cache_dir=str(cache_dir), local_files_only=config.local_files_only, token=False,
                                     ignore_patterns=["*.onnx", "*.xml", "*.bin" , "*.h5", "*.ot"])
        # Resolved commit is part of the identity, even when configured revision is 'main'.
        self.model_id = config.model_name + "@" + Path(snapshot).name
        self.model = SentenceTransformer(snapshot, device=config.device, trust_remote_code=False,
                                         local_files_only=True)
        self.dimension = int(self.model.get_embedding_dimension())
        self.max_tokens = int(self.model.max_seq_length)
        self.config = config

    def count_tokens(self, text: str) -> int:
        return len(self.model.tokenizer.encode(text, add_special_tokens=True, truncation=False))

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if any(not t.strip() or self.count_tokens(t) > self.max_tokens for t in texts):
            raise ValueError("Empty or oversized embedding input; refusing silent truncation")
        result = self.model.encode(texts, batch_size=self.config.batch_size,
                                   normalize_embeddings=True, show_progress_bar=False).tolist()
        if any(len(v) != self.dimension or not all(isfinite(x) for x in v) for v in result):
            raise ValueError("Invalid embedding result")
        return result

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
