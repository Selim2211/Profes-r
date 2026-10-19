import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionStore, StoredSection } from "./map";

// section_summaries rows for one document. `userId` is written explicitly so the same code also
// works with a service-role client; with a user client RLS enforces ownership either way.
export function createSectionStore(supabase: SupabaseClient, documentId: string, userId: string): SectionStore {
  return {
    async list() {
      const { data, error } = await supabase
        .from("section_summaries")
        .select("section_index, title, page_start, page_end, source_hash, content")
        .eq("document_id", documentId)
        .order("section_index");
      if (error) throw new Error(error.message);
      return (data ?? []) as StoredSection[];
    },

    async save(row) {
      const { error } = await supabase
        .from("section_summaries")
        .upsert({ ...row, document_id: documentId, user_id: userId }, { onConflict: "document_id,section_index" });
      if (error) throw new Error(error.message);
    },

    async deleteFrom(index) {
      const { error } = await supabase
        .from("section_summaries")
        .delete()
        .eq("document_id", documentId)
        .gte("section_index", index);
      if (error) throw new Error(error.message);
    },
  };
}
