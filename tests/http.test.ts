import { describe, expect, it } from "vitest";
import { readJson } from "@/lib/utils/http";

describe("readJson", () => {
  it("parses a JSON body", async () => {
    const response = new Response(JSON.stringify({ stage: "done", progress: 100 }));
    expect(await readJson<{ stage: string }>(response)).toEqual({ stage: "done", progress: 100 });
  });

  it("explains a plain-text error page instead of leaking the JSON parse error", async () => {
    const response = new Response("An error occurred with your deployment", { status: 500 });
    await expect(readJson(response)).rejects.toThrow("Devam et");
  });

  it("names a timeout", async () => {
    const response = new Response("FUNCTION_INVOCATION_TIMEOUT", { status: 504 });
    await expect(readJson(response)).rejects.toThrow("zaman aşımı");
  });
});
