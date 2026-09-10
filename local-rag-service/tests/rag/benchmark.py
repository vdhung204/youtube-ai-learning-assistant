"""Benchmark a real local model on explicit synthetic fixtures; no fake encoder is accepted."""
import argparse
from dataclasses import asdict, replace
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import statistics
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.chunking.chunker import chunk_transcript
from app.chunking.config import ChunkingConfig
from app.embedding.config import EmbeddingConfig
from app.embedding.sentence_transformer_embedder import SentenceTransformerEmbedder
from app.retrieval.config import RetrievalConfig
from app.retrieval.retriever import Retriever
from app.transcript.models import TranscriptSegment
from app.transcript.processor import process_transcript
from app.transcript.merger import merge_short_segments
from app.vector_store.chroma_store import ChromaStore


def relevant(chunk, window):
    start, end = window
    overlap = max(0, min(chunk["endSec"], end) - max(chunk["startSec"], start))
    return overlap >= (end - start) * 0.5 if end > start else chunk["startSec"] <= start <= chunk["endSec"]


def summarize(rows):
    positives = [r for r in rows if r["answerable"]]
    negatives = [r for r in rows if not r["answerable"]]
    errors = [r["timestampStartErrorSec"] for r in positives if r["timestampStartErrorSec"] is not None]
    return {"queryCount": len(rows), "answerableCount": len(positives),
            "recallAtK": statistics.mean(r["recallAtK"] for r in positives) if positives else None,
            "mrr": statistics.mean(r["reciprocalRank"] for r in positives) if positives else None,
            "abstentionAccuracy": statistics.mean(not r["returned"] for r in negatives) if negatives else None,
            "meanTimestampStartErrorSecOnHits": statistics.mean(errors) if errors else None,
            "meanQueryMs": statistics.mean(r["queryMs"] for r in rows) if rows else None}


def evaluate(embedder, dataset, cache_root, chunk_config, retrieval_config, split):
    pipeline = "benchmark-v1-" + str(chunk_config.max_tokens) + "-" + str(chunk_config.overlap_tokens)
    rows = []
    index_seconds = 0
    with tempfile.TemporaryDirectory(dir=cache_root, ignore_cleanup_errors=True) as temporary:
        store = ChromaStore(Path(temporary), embedder.model_id, pipeline, embedder.dimension)
        try:
            retriever = Retriever(embedder, store, retrieval_config)
            for case in dataset["videos"]:
                if case["split"] != split:
                    continue
                video = case["video"]
                start = time.perf_counter()
                segments = [TranscriptSegment(s["text"], s["startSec"], s["endSec"], s["position"])
                            for s in case["transcriptSegments"]]
                segments = merge_short_segments(process_transcript(segments, video["durationSec"]),
                                                chunk_config.merge_min_chars, chunk_config.merge_gap_sec)
                chunks = chunk_transcript(segments, video["videoId"], video["language"], pipeline, embedder, chunk_config)
                embeddings = embedder.embed_documents([c.text for c in chunks])
                store.commit(video["videoId"], "synthetic", video["durationSec"], chunks, embeddings)
                index_seconds += time.perf_counter() - start
                for query in case["queries"]:
                    start = time.perf_counter()
                    results = retriever.search(video["videoId"], query["query"])
                    elapsed = (time.perf_counter() - start) * 1000
                    windows = query["expected"]
                    ranks = [i + 1 for i, c in enumerate(results) if any(relevant(c, w) for w in windows)]
                    hits = sum(any(relevant(c, w) for c in results) for w in windows)
                    error = min(abs(results[ranks[0] - 1]["startSec"] - w[0]) for w in windows) if ranks else None
                    rows.append({"videoId": video["videoId"], "query": query["query"], "answerable": bool(windows),
                                 "recallAtK": hits / len(windows) if windows else None,
                                 "reciprocalRank": 1 / ranks[0] if ranks else 0,
                                 "timestampStartErrorSec": error, "queryMs": elapsed,
                                 "returned": [{k: c[k] for k in ("startSec", "endSec", "score")} for c in results]})
        finally:
            store.close()
    return {"split": split, "chunking": asdict(chunk_config), "retrieval": asdict(retrieval_config),
            "indexSeconds": index_seconds, "metrics": summarize(rows), "queries": rows}


def main():
    import psutil
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=Path(__file__).parent / "fixtures/evaluation.json")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default=EmbeddingConfig().model_name)
    parser.add_argument("--revision", default=EmbeddingConfig().revision)
    parser.add_argument("--sweep", action="store_true", help="Choose config on development videos, evaluate held-out videos once")
    args = parser.parse_args()
    dataset = json.loads(args.dataset.read_text(encoding="utf-8"))
    root = Path(__file__).resolve().parents[2] / "data"
    (root / "benchmarks").mkdir(parents=True, exist_ok=True)
    process = psutil.Process()
    samples = []
    done = threading.Event()
    def sample():
        while not done.wait(0.05):
            samples.append(process.memory_info().rss)
    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    try:
        started = time.perf_counter()
        embedder = SentenceTransformerEmbedder(root / "models", replace(EmbeddingConfig(), model_name=args.model, revision=args.revision))
        load_seconds = time.perf_counter() - started
        configs = [(ChunkingConfig(), RetrievalConfig())]
        if args.sweep:
            configs = [(ChunkingConfig(max_tokens=size, overlap_tokens=overlap), RetrievalConfig(top_k=k, threshold=t))
                       for size, overlap in ((64, 8), (96, 16)) for k in (3, 5) for t in (0.35, 0.5)]
        development = [evaluate(embedder, dataset, root / "benchmarks", c, r, "development") for c, r in configs]
        # Prefer retrieval quality and abstention, then smaller top-k. No tuning on evaluation queries.
        best = max(range(len(configs)), key=lambda i: (
            (development[i]["metrics"]["recallAtK"] or 0) + (development[i]["metrics"]["abstentionAccuracy"] or 0),
            development[i]["metrics"]["mrr"] or 0, -configs[i][1].top_k))
        evaluation = evaluate(embedder, dataset, root / "benchmarks", *configs[best], "evaluation")
        model_bytes = sum(p.stat().st_size for p in (root / "models" / ("models--" + args.model.replace("/", "--"))).rglob("*") if p.is_file())
        report = {"createdAt": datetime.now(timezone.utc).isoformat(), "datasetVersion": dataset["datasetVersion"],
                  "provenance": dataset["provenance"], "model": embedder.model_id, "dimension": embedder.dimension,
                  "maxSequenceTokens": embedder.max_tokens, "modelLoadSeconds": load_seconds,
                  "modelCacheBytes": model_bytes, "sampledPeakRssBytes": max(samples, default=process.memory_info().rss),
                  "python": platform.python_version(), "platform": platform.platform(), "logicalCpus": psutil.cpu_count(),
                  "developmentRuns": development, "selectedRun": best, "evaluation": evaluation,
                  "limitations": ["Synthetic text, not a real YouTube video evaluation.",
                                  "50 ms sampled RSS is approximate and includes runtime/cache overhead.",
                                  "Timestamp hit means at least half of an expected interval is covered.",
                                  "No OAuth/Gemini generation or human grounding evaluation in this benchmark."]}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"model": report["model"], "selectedRun": best, "evaluation": evaluation["metrics"]}, ensure_ascii=False))
    finally:
        done.set()
        sampler.join()


if __name__ == "__main__":
    main()
