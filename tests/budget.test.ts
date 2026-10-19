import { describe, expect, it } from "vitest";
import { DEFAULT_DAILY_TOKEN_BUDGET, dailyBudget, totalTokens } from "@/lib/ai/budget";
import { startOfDayIstanbul, startOfMonthIstanbul } from "@/lib/utils/time";

describe("dailyBudget", () => {
  it("reads the env value and falls back to the default for missing or invalid values", () => {
    expect(dailyBudget("500000")).toBe(500_000);
    expect(dailyBudget(undefined)).toBe(DEFAULT_DAILY_TOKEN_BUDGET);
    expect(dailyBudget("abc")).toBe(DEFAULT_DAILY_TOKEN_BUDGET);
    expect(dailyBudget("-5")).toBe(DEFAULT_DAILY_TOKEN_BUDGET);
  });
});

describe("totalTokens", () => {
  it("adds input and output tokens, also when the database returns them as strings", () => {
    expect(totalTokens([])).toBe(0);
    expect(totalTokens([{ input_tokens: 10, output_tokens: 5 }, { input_tokens: 1, output_tokens: 2 }])).toBe(18);
    expect(totalTokens([{ input_tokens: "7" as unknown as number, output_tokens: 3 }])).toBe(10);
  });
});

describe("Istanbul day and month boundaries", () => {
  it("starts the day at 00:00 +03:00", () => {
    // 21:30 UTC on Oct 19 is already 00:30 on Oct 20 in Istanbul.
    expect(startOfDayIstanbul(new Date("2026-10-19T21:30:00Z")).toISOString()).toBe("2026-10-19T21:00:00.000Z");
    // 20:59 UTC is still Oct 19 (23:59) in Istanbul.
    expect(startOfDayIstanbul(new Date("2026-10-19T20:59:00Z")).toISOString()).toBe("2026-10-18T21:00:00.000Z");
  });

  it("starts the month on the 1st at 00:00 +03:00", () => {
    expect(startOfMonthIstanbul(new Date("2026-10-19T12:00:00Z")).toISOString()).toBe("2026-09-30T21:00:00.000Z");
    // 22:00 UTC on Oct 31 is Nov 1 in Istanbul.
    expect(startOfMonthIstanbul(new Date("2026-10-31T22:00:00Z")).toISOString()).toBe("2026-10-31T21:00:00.000Z");
  });
});
