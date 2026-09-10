from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    video_id: str
    text: str
    start_sec: float
    end_sec: float
    position: int
    language: str
    pipeline_version: str

    def retrieved(self, score: float) -> dict:
        return {"chunkId": self.chunk_id, "videoId": self.video_id, "text": self.text,
                "startSec": self.start_sec, "endSec": self.end_sec,
                "position": self.position, "score": score}
