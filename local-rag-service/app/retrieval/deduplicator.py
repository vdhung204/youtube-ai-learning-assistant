def deduplicate(chunks: list[dict], overlap_threshold: float = 0.8) -> list[dict]:
    selected = []
    for chunk in sorted(chunks, key=lambda c: (-c["score"], c["position"])):
        duplicate = False
        for previous in selected:
            if previous["videoId"] != chunk["videoId"]:
                continue
            if previous["chunkId"] == chunk["chunkId"] or previous["text"].casefold() == chunk["text"].casefold():
                duplicate = True
                break
            duration = min(previous["endSec"] - previous["startSec"], chunk["endSec"] - chunk["startSec"])
            overlap = max(0, min(previous["endSec"], chunk["endSec"]) - max(previous["startSec"], chunk["startSec"]))
            # Same timestamp alone is insufficient: long split segments share source intervals.
            a, b = set(previous["text"].casefold().split()), set(chunk["text"].casefold().split())
            similarity = len(a & b) / max(1, min(len(a), len(b)))
            if duration > 0 and overlap / duration >= overlap_threshold and similarity >= overlap_threshold:
                duplicate = True
                break
        if not duplicate:
            selected.append(chunk)
    return selected
