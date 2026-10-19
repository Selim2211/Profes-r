import { generateObject, generateText, type LanguageModel } from "ai";
import { z } from "zod";

// Structured output has two ways to work, because not every model supports the provider's schema mode:
//  - "native": the SDK forces the schema (generateObject). Best where the model supports it (Gemini).
//  - "text":   the model is asked for plain JSON that matches the schema, the answer is parsed and checked
//              here, and one correction round is made if it does not validate. Works with any capable model.
// Chosen with AI_STRUCTURED_OUTPUT (default "native").
export type StructuredMode = "native" | "text";

export function structuredMode(raw: string | undefined = process.env.AI_STRUCTURED_OUTPUT): StructuredMode {
  return raw === "text" ? "text" : "native";
}

// Pulls the JSON object out of a model answer that may have fences or a sentence around it.
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  if (start === -1) throw new Error("Cevapta JSON nesnesi bulunamadı.");

  // Walk to the matching closing brace, ignoring braces inside strings.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(unfenced.slice(start, i + 1));
  }
  throw new Error("JSON nesnesi tamamlanmamış.");
}

export function jsonInstructions(schema: z.ZodType): string {
  return `\n\nCevabını SADECE geçerli bir JSON nesnesi olarak ver: Markdown bloğu, açıklama veya ek metin olmasın. JSON şu JSON Schema'ya uymalı:\n${JSON.stringify(z.toJSONSchema(schema))}`;
}

type TextGenerator = (system: string, prompt: string) => Promise<string>;

// The "text" strategy, with the model call injected so it can be tested without a model.
export async function generateJsonViaText<S extends z.ZodType>(
  generate: TextGenerator,
  schema: S,
  system: string,
  prompt: string,
  attempts = 2,
): Promise<z.infer<S>> {
  const fullSystem = system + jsonInstructions(schema);
  let feedback = "";
  let lastError = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    const answer = await generate(fullSystem, prompt + feedback);
    try {
      const parsed = schema.safeParse(extractJson(answer));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(kök)"}: ${i.message}`).join("; ");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    feedback = `\n\nÖnceki cevabın geçersizdi (${lastError}). Yalnızca düzeltilmiş JSON nesnesini ver.`;
  }
  throw new Error(`Model geçerli yapılandırılmış çıktı üretemedi: ${lastError}`);
}

export async function generateStructured<S extends z.ZodType>(args: {
  model: LanguageModel;
  schema: S;
  system: string;
  prompt: string;
  temperature?: number;
}): Promise<z.infer<S>> {
  const { model, schema, system, prompt, temperature } = args;

  if (structuredMode() === "native") {
    const { object } = await generateObject({ model, schema, system, prompt, temperature });
    return object as z.infer<S>;
  }
  return generateJsonViaText(
    async (fullSystem, fullPrompt) => (await generateText({ model, system: fullSystem, prompt: fullPrompt, temperature })).text,
    schema,
    system,
    prompt,
  );
}
