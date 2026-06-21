import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the logic without a real DB/network by mocking the db module and fetch.

vi.mock("../../db.js", () => ({
  query: vi.fn(),
}));

import { query } from "../../db.js";
const mockQuery = query as ReturnType<typeof vi.fn>;

// We need to import after mocking
const { getAvatar } = await import("./service.js");

const FRESH_DATE = new Date(Date.now() - 1000).toISOString(); // 1 second ago
const STALE_DATE = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
const CACHED_B64 = Buffer.from("png-bytes").toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", undefined);
});

describe("getAvatar — cache hit (fresh)", () => {
  it("returns cached bytes without calling Mojang", async () => {
    mockQuery.mockResolvedValueOnce([[{ image_base64: CACHED_B64, fetched_at: FRESH_DATE }]]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getAvatar("Spyke");
    expect(result).toEqual(Buffer.from(CACHED_B64, "base64"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("getAvatar — cache miss", () => {
  it("fetches UUID then head, caches, and returns bytes", async () => {
    // Cache miss
    mockQuery.mockResolvedValueOnce([[]]); // no cache row
    // Cache upsert
    mockQuery.mockResolvedValueOnce([{}]);

    const fakeBytes = Buffer.from("fake-png");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "abc123" }) }) // Mojang
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => fakeBytes.buffer }); // Crafatar
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAvatar("Spyke");
    expect(result).toEqual(fakeBytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("api.mojang.com");
    expect(fetchMock.mock.calls[1][0]).toContain("abc123");
  });
});

describe("getAvatar — mirror fallback", () => {
  it("tries next mirror if first fails", async () => {
    mockQuery.mockResolvedValueOnce([[]]); // cache miss
    mockQuery.mockResolvedValueOnce([{}]); // upsert

    const fakeBytes = Buffer.from("fake-png");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "uuid1" }) }) // Mojang
      .mockRejectedValueOnce(new Error("mirror 1 down")) // first Crafatar mirror
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => fakeBytes.buffer }); // second mirror
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAvatar("SomePlayer");
    expect(result).toEqual(fakeBytes);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("getAvatar — unknown username", () => {
  it("returns null (caller serves Steve placeholder)", async () => {
    mockQuery.mockResolvedValueOnce([[]]); // cache miss
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }); // Mojang 404
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAvatar("NoSuchPlayer");
    expect(result).toBeNull();
  });
});

describe("getAvatar — all mirrors down", () => {
  it("returns null", async () => {
    mockQuery.mockResolvedValueOnce([[]]); // cache miss
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "uid" }) }) // Mojang OK
      .mockRejectedValue(new Error("all down")); // all Crafatar mirrors fail
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAvatar("SomePlayer");
    expect(result).toBeNull();
  });
});
