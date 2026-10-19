import { describe, expect, it } from "vitest";
import { STEP_LABELS, STEP_ORDER, stepProgress } from "@/lib/summary/jobs";

describe("summary job steps", () => {
  it("lists the steps in pipeline order", () => {
    expect(STEP_ORDER).toEqual(["transcribe", "section", "map", "reduce", "coverage", "verify", "done"]);
  });

  it("has a Turkish label for every step including failed", () => {
    for (const step of [...STEP_ORDER, "failed" as const]) expect(STEP_LABELS[step].length).toBeGreaterThan(2);
  });
});

describe("stepProgress", () => {
  it("never goes backwards across steps and ends at 100", () => {
    let previous = -1;
    for (const step of STEP_ORDER) {
      const start = stepProgress(step, 0);
      const end = stepProgress(step, 1);
      expect(start).toBeGreaterThanOrEqual(previous);
      expect(end).toBeGreaterThanOrEqual(start);
      previous = end;
    }
    expect(stepProgress("done", 0)).toBe(100);
  });

  it("interpolates inside a step and clamps the fraction", () => {
    expect(stepProgress("map", 0)).toBe(15);
    expect(stepProgress("map", 0.5)).toBe(35);
    expect(stepProgress("map", 5)).toBe(55);
    expect(stepProgress("map", -1)).toBe(15);
  });
});
