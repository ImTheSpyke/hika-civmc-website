import { describe, it, expect } from "vitest";

const MAX = 5000;

function validateBody(body: string): string | null {
  if (body.length > MAX) return "error.tooLong";
  return null;
}

describe("global notes validation", () => {
  it("accepts up to 5000 chars", () => {
    expect(validateBody("a".repeat(5000))).toBeNull();
  });

  it("rejects 5001 chars", () => {
    expect(validateBody("a".repeat(5001))).toBe("error.tooLong");
  });

  it("accepts empty string", () => {
    expect(validateBody("")).toBeNull();
  });
});
