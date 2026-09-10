"""Export the current TV2 draft DTOs for review; never overwrite shared/contracts."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pydantic.json_schema import models_json_schema
from app.transport import models


def main():
    names = ["Video", "Segment", "IndexRequest", "IndexResponse", "IndexStatusResponse", "RetrieveRequest",
             "RetrieveResponse", "Question", "AssessmentRequest", "AssessmentResponse", "DeleteResponse",
             "HealthResponse", "ErrorResponse"]
    _, schema = models_json_schema([(getattr(models, name), "validation") for name in names],
                                   title="TV2 / TV3 integration draft - pending team review")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    target = Path(__file__).resolve().parents[2] / "app/retrieval/contracts/local-service.schema.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(schema, ensure_ascii=False, indent=2), encoding="utf-8")
    print(target.name)


if __name__ == "__main__":
    main()
