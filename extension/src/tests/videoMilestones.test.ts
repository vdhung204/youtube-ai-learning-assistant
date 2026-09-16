import { describe, expect, it } from "vitest";
import { buildVideoMilestones } from "../sidebar/utils/videoMilestones";

describe("buildVideoMilestones", () => {
  it("returns no fabricated milestones when YouTube has no named chapters", () => {
    expect(buildVideoMilestones([])).toEqual([]);
  });

  it("returns every named YouTube chapter in timestamp order without transcript text", () => {
    const milestones = buildVideoMilestones(
      Array.from({ length: 8 }, (_, index) => ({
        startSec: index * 10,
        title: `Chủ đề ${index + 1}`,
      })),
    );

    expect(milestones).toHaveLength(8);
    expect(milestones.map((item) => item.startSec)).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(milestones.map((item) => item.label)).toEqual([
      "Chủ đề 1",
      "Chủ đề 2",
      "Chủ đề 3",
      "Chủ đề 4",
      "Chủ đề 5",
      "Chủ đề 6",
      "Chủ đề 7",
      "Chủ đề 8",
    ]);
  });
});
