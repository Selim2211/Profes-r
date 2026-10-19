import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_SECONDS = 600;

const querySchema = z.object({
  conversationId: z.string().uuid(),
  week: z.coerce.number().int().min(1).max(52).nullable(),
  page: z.coerce.number().int().min(1),
});

type Citation = { chunk_id: string; week: number | null; page: number };

// Resolves a "[H3 · s.12]" badge to the note text and a signed link to the source file.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    conversationId: params.get("conversationId"),
    week: params.get("week") || null,
    page: params.get("page"),
  });
  if (!parsed.success) return Response.json({ error: "Geçersiz istek." }, { status: 400 });
  const { conversationId, week, page } = parsed.data;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("course_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return Response.json({ error: "Sohbet bulunamadı." }, { status: 404 });

  // Prefer the sources the assistant actually used in this conversation.
  const { data: messages } = await supabase
    .from("messages")
    .select("citations")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false });

  const known = (messages ?? [])
    .flatMap((m) => (m.citations ?? []) as Citation[])
    .find((c) => c.week === week && c.page === page);

  let chunkQuery = supabase
    .from("chunks")
    .select("id, document_id, week_number, page_start, page_end, heading, content")
    .limit(1);

  if (known) {
    chunkQuery = chunkQuery.eq("id", known.chunk_id);
  } else {
    chunkQuery = chunkQuery.lte("page_start", page).gte("page_end", page);
    chunkQuery = week === null ? chunkQuery.is("week_number", null) : chunkQuery.eq("week_number", week);
    if (conversation.course_id) chunkQuery = chunkQuery.eq("course_id", conversation.course_id);
  }

  const { data: chunk } = await chunkQuery.maybeSingle();
  if (!chunk) return Response.json({ error: "Kaynak bulunamadı." }, { status: 404 });

  const { data: doc } = await supabase
    .from("documents")
    .select("title, storage_path")
    .eq("id", chunk.document_id)
    .maybeSingle();

  let fileUrl: string | null = null;
  if (doc) {
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
    if (signed?.signedUrl) {
      fileUrl = doc.storage_path.toLowerCase().endsWith(".pdf")
        ? `${signed.signedUrl}#page=${chunk.page_start}`
        : signed.signedUrl;
    }
  }

  return Response.json({
    title: doc?.title ?? "Doküman",
    week: chunk.week_number,
    pageStart: chunk.page_start,
    pageEnd: chunk.page_end,
    heading: chunk.heading,
    content: chunk.content,
    fileUrl,
  });
}
