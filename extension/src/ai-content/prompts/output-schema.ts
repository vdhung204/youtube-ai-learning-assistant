export type ContentKind = "questions" | "flashcards" | "feedback" | "answers";

const STRING_SCHEMA = { type: "string" };
const GROUNDING_PROPERTIES = {
  topic: STRING_SCHEMA,
  sourceChunkId: STRING_SCHEMA,
  evidence: STRING_SCHEMA,
};

function itemProperties(kind: ContentKind): Record<string, unknown> {
  switch (kind) {
    case "questions":
      return {
        ...GROUNDING_PROPERTIES,
        question: STRING_SCHEMA,
        options: { type: "array", items: STRING_SCHEMA, minItems: 4, maxItems: 4 },
        correctAnswer: { type: "integer", minimum: 0, maximum: 3 },
        explanation: {
          type: "string",
          description: "A clear 2-4 sentence teaching explanation grounded in the cited evidence.",
        },
      };
    case "flashcards":
      return { ...GROUNDING_PROPERTIES, front: STRING_SCHEMA, back: STRING_SCHEMA };
    case "answers":
      return {
        ...GROUNDING_PROPERTIES,
        answer: {
          type: "string",
          description: "One detailed teaching paragraph of 3-6 sentences grounded in the cited evidence.",
        },
      };
    default:
      return { ...GROUNDING_PROPERTIES, comment: STRING_SCHEMA };
  }
}

export function outputSchema(
  kind: ContentKind,
  requestedCount = 100,
): Record<string, unknown> {
  const properties = itemProperties(kind);
  return {
    type: "object",
    additionalProperties: false,
    required: ["status", kind],
    properties: {
      status: { type: "string", enum: ["ok", "insufficient_context"] },
      [kind]: {
        type: "array",
        ...(kind === "questions" ? { minItems: requestedCount } : {}),
        maxItems: requestedCount,
        items: {
          type: "object",
          additionalProperties: false,
          properties,
          required: Object.keys(properties),
        },
      },
    },
  };
}
