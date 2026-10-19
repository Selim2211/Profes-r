import { it } from "vitest";
import { evalClient } from "../eval/helpers";

// Vectors from different embedding models cannot be compared, so after changing AI_PROVIDER or
// AI_MODEL_EMBEDDING every stored chunk must be embedded again with the active model. This does that
// for all chunks (it only costs embedding tokens, no text generation).
it("chunk vektörlerini etkin embedding modeliyle yeniden hesapla", async () => {
  const { embedTexts } = await import("@/lib/ingest/embed");
  const supabase = evalClient();

  const { data: chunks, error } = await supabase.from("chunks").select("id, content").order("id");
  if (error) throw new Error(error.message);

  const batchSize = 16;
  let done = 0;
  for (let i = 0; i < (chunks ?? []).length; i += batchSize) {
    const batch = chunks!.slice(i, i + batchSize);
    const vectors = await embedTexts(batch.map((c) => c.content));
    for (let j = 0; j < batch.length; j++) {
      const { error: updateError } = await supabase
        .from("chunks")
        .update({ embedding: JSON.stringify(vectors[j]) })
        .eq("id", batch[j].id);
      if (updateError) throw new Error(updateError.message);
      done++;
    }
  }
  process.stdout.write(`\n${done} parça ${process.env.AI_MODEL_EMBEDDING} (${process.env.AI_PROVIDER}) ile yeniden gömüldü.\n`);
}, 900_000);
