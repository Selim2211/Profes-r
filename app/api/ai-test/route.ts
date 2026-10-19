import { generateText } from "ai";
import { connection } from "next/server";
import { fastModel } from "@/lib/ai/models";

// Temporary Phase 0 route: verifies the model connection. Remove after Phase 0 acceptance.
export async function GET() {
  await connection();
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  try {
    const { text } = await generateText({
      model: fastModel(),
      prompt: "Türkçe olarak tek cümleyle 'merhaba' de.",
    });
    return Response.json({ ok: true, text });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
