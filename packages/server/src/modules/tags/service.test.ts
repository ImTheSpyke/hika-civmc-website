import { describe, it, expect } from "vitest";

const MAX_TAGS = 200;

function canCreateTag(currentCount: number): boolean {
  return currentCount < MAX_TAGS;
}

describe("tag limit", () => {
  it("allows creating the 200th tag", () => {
    expect(canCreateTag(199)).toBe(true);
  });

  it("rejects the 201st tag", () => {
    expect(canCreateTag(200)).toBe(false);
  });

  it("allows with zero tags", () => {
    expect(canCreateTag(0)).toBe(true);
  });
});
