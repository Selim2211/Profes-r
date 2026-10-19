import { describe, expect, it } from "vitest";
import { describeModelError, textStreamResponse } from "@/lib/ai/stream";

async function* parts(...items: unknown[]) {
  for (const item of items) yield item as never;
}

describe("describeModelError", () => {
  it("explains the known provider problems in Turkish", () => {
    expect(describeModelError(new Error("Your prepayment credits are depleted."))).toContain("kredisi");
    expect(describeModelError(new Error("0 endpoints available matching your guardrail restrictions and data policy. ZDR violation"))).toContain("gizlilik");
    expect(describeModelError(new Error("429 Too Many Requests"))).toContain("istek sınırına");
    expect(describeModelError("Unauthorized: invalid API key")).toContain("anahtarı");
  });

  it("falls back to a shortened raw message for unknown errors", () => {
    const message = describeModelError(new Error("x".repeat(500)));
    expect(message.startsWith("Model cevap veremedi: ")).toBe(true);
    expect(message.length).toBeLessThan(200);
    expect(describeModelError(undefined)).toBe("Model cevap veremedi.");
  });
});

describe("textStreamResponse", () => {
  it("streams only the text deltas", async () => {
    const response = textStreamResponse({
      fullStream: parts({ type: "start" }, { type: "text-delta", id: "1", text: "Mer" }, { type: "tool-call" }, { type: "text-delta", id: "1", text: "haba" }),
    });
    expect(await response.text()).toBe("Merhaba");
    expect(response.headers.get("Content-Type")).toContain("text/plain");
  });

  it("shows a readable message and reports it when the model fails without any text", async () => {
    const failures: string[] = [];
    const response = textStreamResponse(
      { fullStream: parts({ type: "error", error: new Error("credits depleted") }) },
      { onFailure: (m) => void failures.push(m) },
    );
    const text = await response.text();
    expect(text.startsWith("⚠️ ")).toBe(true);
    expect(text).toContain("kredisi");
    expect(failures).toHaveLength(1);
  });

  it("keeps the partial answer and appends the message when the stream breaks midway", async () => {
    async function* broken() {
      yield { type: "text-delta", id: "1", text: "Yarım cevap" } as never;
      throw new Error("429 rate limit");
    }
    const text = await textStreamResponse({ fullStream: broken() }).text();
    expect(text.startsWith("Yarım cevap\n\n⚠️ ")).toBe(true);
  });

  it("passes extra headers through", async () => {
    const response = textStreamResponse({ fullStream: parts() }, { headers: { "X-Conversation-Id": "abc" } });
    expect(response.headers.get("X-Conversation-Id")).toBe("abc");
    expect(await response.text()).toBe("");
  });
});
