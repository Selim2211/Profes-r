import { describe, expect, it } from "vitest";
import { isAllowedEmail, parseAllowedEmails } from "@/lib/auth/allowed";

describe("allowed emails", () => {
  it("parses a comma separated list", () => {
    expect(parseAllowedEmails(" A@x.com, b@y.com ,, ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });

  it("matches case-insensitively", () => {
    expect(isAllowedEmail("A@X.com", "a@x.com")).toBe(true);
  });

  it("rejects addresses not on the list and empty config", () => {
    expect(isAllowedEmail("c@z.com", "a@x.com")).toBe(false);
    expect(isAllowedEmail("a@x.com", undefined)).toBe(false);
  });
});
