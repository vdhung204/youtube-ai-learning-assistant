import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VideoMilestones } from "../sidebar/components/Video";

afterEach(cleanup);

const milestones = Array.from({ length: 5 }, (_, index) => ({
  label: `Chủ đề ${index + 1}`,
  startSec: index * 60,
}));

describe("VideoMilestones", () => {
  it("keeps all timestamps in a three-row scrollable list", async () => {
    const onSeek = vi.fn();
    const user = userEvent.setup();
    render(<VideoMilestones milestones={milestones} onSeek={onSeek} />);

    const list = screen.getByRole("region", { name: "Danh sách timestamp của video" });
    expect(list.classList.contains("is-scrollable")).toBe(true);
    expect(list.getAttribute("tabindex")).toBe("0");
    expect(screen.getAllByRole("button", { name: /Mở video tại/u })).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: /Mở video tại 04:00/u }));
    expect(onSeek).toHaveBeenCalledWith(240);
  });

  it("does not create an inner scroll area for three timestamps", () => {
    render(<VideoMilestones milestones={milestones.slice(0, 3)} onSeek={() => undefined} />);

    const list = screen.getByRole("region", { name: "Danh sách timestamp của video" });
    expect(list.classList.contains("is-scrollable")).toBe(false);
    expect(list.hasAttribute("tabindex")).toBe(false);
  });
});
