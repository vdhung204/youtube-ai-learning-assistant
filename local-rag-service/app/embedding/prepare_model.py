"""Explicit model preparation: python -m app.embedding.prepare_model --model MODEL."""
import argparse
from dataclasses import replace
from pathlib import Path

from .config import EmbeddingConfig
from .sentence_transformer_embedder import SentenceTransformerEmbedder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=EmbeddingConfig().model_name)
    parser.add_argument("--revision", default=EmbeddingConfig().revision)
    parser.add_argument("--cache-dir", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "models")
    args = parser.parse_args()
    config = replace(EmbeddingConfig(), model_name=args.model, revision=args.revision, local_files_only=False)
    embedder = SentenceTransformerEmbedder(args.cache_dir, config)
    print(f"Model ready: {embedder.model_id}; dimension={embedder.dimension}; max_tokens={embedder.max_tokens}")


if __name__ == "__main__":
    main()
