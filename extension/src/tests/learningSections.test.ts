import { describe, expect, it } from "vitest";
import { buildLearningSections } from "../integrations/learning/sections";

describe("learning sections", () => {
  it("preserves official chapter names and their full ranges", () => {
    const sections = buildLearningSections([{label: "Intro", startSec: 0}, {label: "Concept", startSec: 45}], 180);
    expect(sections.map(s => [s.title, s.startSec, s.endSec])).toEqual([["Intro", 0, 45], ["Concept", 45, 180]]);
  });
  it("splits long chapters at subtitle boundaries and leaves no timeline gaps", () => {
    const segments = Array.from({length: 100}, (_, position) => ({position,
      startSec: position * 11, endSec: position * 11 + 10, text: "A complete teaching passage."}));
    const sections = buildLearningSections([{label: "History", startSec: 0}], 1100, segments);
    expect(sections).toHaveLength(4);
    expect(sections[0].title).toBe("History — phần 1");
    expect(sections[0].endSec).toBe(308);
    expect(sections.at(-1)?.endSec).toBe(1100);
    sections.slice(1).forEach((s, i) => expect(s.startSec).toBe(sections[i].endSec));
  });
  it("covers videos without chapters without inventing topic labels", () => {
    const sections = buildLearningSections([], 3600);
    expect(sections.length).toBeGreaterThan(6);
    expect(sections[0]).toMatchObject({title: "Phần 1", startSec: 0, source: "transcript"});
    expect(sections.at(-1)?.endSec).toBe(3600);
  });
  it("bounds dense chapters by transcript size as well as duration", () => {
    const segments = Array.from({length: 30}, (_, position) => ({position,
      startSec: position * 3, endSec: position * 3 + 3, text: "x".repeat(1000)}));
    expect(buildLearningSections([], 90, segments)).toHaveLength(4);
  });
});
