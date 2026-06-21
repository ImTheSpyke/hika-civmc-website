import { describe, it, expect } from "vitest";

// Pure logic test — the threshold math
const THRESHOLD = 0.10;

function shouldAutoHide(reporters: number, approvedUsers: number): boolean {
  if (approvedUsers === 0) return false;
  return reporters / approvedUsers > THRESHOLD;
}

describe("moderation threshold", () => {
  it("hides when reporters exceed 10%", () => {
    expect(shouldAutoHide(11, 100)).toBe(true);
  });

  it("does not hide at exactly 10%", () => {
    expect(shouldAutoHide(10, 100)).toBe(false);
  });

  it("does not hide below 10%", () => {
    expect(shouldAutoHide(9, 100)).toBe(false);
  });

  it("scales with live user count", () => {
    // 50 users: need > 5 reports
    expect(shouldAutoHide(5, 50)).toBe(false);
    expect(shouldAutoHide(6, 50)).toBe(true);
  });

  it("handles zero approved users safely", () => {
    expect(shouldAutoHide(5, 0)).toBe(false);
  });
});
