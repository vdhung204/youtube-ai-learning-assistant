"""Atomic local index metadata only: no accounts, quiz answers, scores or history."""
import json
import os
from pathlib import Path
from uuid import uuid4


class IndexRepository:
    def __init__(self, path: Path):
        self.path = path
        self.records = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        if not isinstance(self.records, dict):
            raise ValueError("Invalid index registry")

    def get(self, video_id: str) -> dict | None:
        return self.records.get(video_id)

    def put(self, video_id: str, value: dict | None) -> None:
        updated = dict(self.records)
        if value is None:
            updated.pop(video_id, None)
        else:
            updated[video_id] = value
        temporary = self.path.with_suffix("." + uuid4().hex + ".tmp")
        try:
            with temporary.open("w", encoding="utf-8") as stream:
                json.dump(updated, stream, ensure_ascii=False, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
            self.records = updated
        finally:
            temporary.unlink(missing_ok=True)
