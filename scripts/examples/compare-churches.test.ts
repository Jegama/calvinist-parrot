import { afterEach, expect, it, vi } from "vitest";
import { compareChurches } from "./compare-churches.mjs";

afterEach(() => vi.unstubAllGlobals());

it("summarizes unique saved churches and labels capped and empty city results", async () => {
  const fetchPage = vi.fn(async (url: URL) => {
    expect(url.pathname).toBe("/api/v1/churches");
    expect(url.searchParams.get("pageSize")).toBe("25");
    const city = url.searchParams.get("city");
    const page = Number(url.searchParams.get("page"));
    const items = city === "Sunnyvale" ? [] : Array.from({ length: 25 }, (_, i) => ({
      // One result crosses a page boundary if the directory changes during the read.
      id: String((page - 1) * 24 + i),
      status: i === 1 ? "recommended" : "limited_information",
      confessionAdopted: i === 1,
    }));
    return Response.json({ items, page, pageSize: 25, hasMore: city === "Houston" || (city === "Bellevue" && page === 1) });
  });
  vi.stubGlobal("fetch", fetchPage);

  const table = await compareChurches("https://parrot.example");
  expect(table).toContain("| Bellevue, WA | 49 | 2 | 2 | Complete | [Open](https://parrot.example/church-finder?church=0)");
  expect(table).toContain("| Houston, TX | 97 | 4 | 4 | Partial (4 pages) |");
  expect(table).toContain("| Sunnyvale, CA | 0 | 0 | 0 | Complete | — |");
  expect(fetchPage).toHaveBeenCalledTimes(7);
  expect(fetchPage.mock.calls.map(([url]) => url.searchParams.get("state"))).toEqual(["WA", "WA", "TX", "TX", "TX", "TX", "CA"]);
});

it("reports a failed page fetch instead of publishing a zero count", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  await expect(compareChurches()).rejects.toThrow("Bellevue, WA page 1: HTTP 503");
});
