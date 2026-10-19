import { describe, expect, it } from "vitest";
import { pickSavedSummary } from "@/lib/summary/saved";

const row = (id: string, level: string, version: number) => ({ id, level, version, content_md: `özet ${id}` });

describe("pickSavedSummary", () => {
  // Rows arrive newest version first.
  const rows = [row("s3", "short", 3), row("d1", "detailed", 2), row("s2", "short", 2), row("st1", "standard", 1)];

  it("returns the newest summary of the asked level", () => {
    expect(pickSavedSummary(rows, "short")).toMatchObject({ id: "s3", level: "short", version: 3 });
    expect(pickSavedSummary(rows, "detailed")?.id).toBe("d1");
  });

  it("prefers the standard level when no level is asked", () => {
    expect(pickSavedSummary(rows)?.id).toBe("st1");
  });

  it("falls back to another level when the asked one does not exist", () => {
    expect(pickSavedSummary([row("d1", "detailed", 1)], "short")?.level).toBe("detailed");
    expect(pickSavedSummary([row("s1", "short", 1)])?.level).toBe("short");
  });

  it("returns null without summaries", () => {
    expect(pickSavedSummary([])).toBeNull();
    expect(pickSavedSummary([], "short")).toBeNull();
  });

  it("carries the markdown", () => {
    expect(pickSavedSummary(rows, "short")?.contentMd).toBe("özet s3");
  });
});
