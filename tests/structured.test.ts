import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJson, generateJsonViaText, jsonInstructions, structuredMode } from "@/lib/ai/structured";

const schema = z.object({ konu: z.string(), sayi: z.number() });

describe("extractJson", () => {
  it("reads plain JSON, fenced JSON and JSON with text around it", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('İşte cevap: {"a":{"b":[1,2]}} umarım yardımcı olur.')).toEqual({ a: { b: [1, 2] } });
  });

  it("is not confused by braces inside strings", () => {
    expect(extractJson('{"text":"küme {1,2} ve \\"tırnak\\" }","n":3}')).toEqual({ text: 'küme {1,2} ve "tırnak" }', n: 3 });
  });

  it("throws when there is no complete object", () => {
    expect(() => extractJson("hiç JSON yok")).toThrow();
    expect(() => extractJson('{"a": 1')).toThrow();
  });
});

describe("generateJsonViaText", () => {
  it("returns the validated object and tells the model the schema", async () => {
    const seen: { system: string; prompt: string }[] = [];
    const result = await generateJsonViaText(
      async (system, prompt) => {
        seen.push({ system, prompt });
        return '{"konu":"ders","sayi":3}';
      },
      schema,
      "Sistem",
      "İstek",
    );
    expect(result).toEqual({ konu: "ders", sayi: 3 });
    expect(seen).toHaveLength(1);
    expect(seen[0].system).toContain("JSON Schema");
    expect(seen[0].system).toContain('"konu"');
  });

  it("asks once more with the problem when the first answer does not validate", async () => {
    const prompts: string[] = [];
    const answers = ['{"konu":"ders","sayi":"üç"}', '{"konu":"ders","sayi":3}'];
    const result = await generateJsonViaText(async (_s, prompt) => (prompts.push(prompt), answers[prompts.length - 1]), schema, "S", "P");
    expect(result.sayi).toBe(3);
    expect(prompts[1]).toContain("geçersizdi");
    expect(prompts[1]).toContain("sayi");
  });

  it("gives up with a clear error after the attempts are used", async () => {
    await expect(generateJsonViaText(async () => "JSON değil", schema, "S", "P")).rejects.toThrow("yapılandırılmış çıktı");
  });
});

describe("structuredMode and jsonInstructions", () => {
  it("defaults to native and switches to text only when asked", () => {
    expect(structuredMode(undefined)).toBe("native");
    expect(structuredMode("text")).toBe("text");
    expect(structuredMode("native")).toBe("native");
    expect(structuredMode("whatever")).toBe("native");
  });

  it("describes required fields", () => {
    expect(jsonInstructions(schema)).toContain("required");
  });
});
