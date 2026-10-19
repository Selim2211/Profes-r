"use client";

import "katex/dist/katex.min.css";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CITATION_PATTERN } from "@/lib/rag/citations";

type Props = {
  content: string;
  onCitationClick?: (week: number | null, page: number) => void;
};

const ANSWER_PATTERN = /\[\[CEVAP:\s*([\s\S]*?)\]\]/g;

// Parentheses must be escaped too, otherwise they would end the markdown link early.
function encodeAnswer(text: string): string {
  return encodeURIComponent(text).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

// Turns "[H3 · s.12]" tags into "cite:" links and "[[CEVAP: ...]]" into collapsible "answer:" links.
function preprocess(text: string): string {
  return text
    .replace(ANSWER_PATTERN, (_all, answer: string) => `[Cevabı göster](answer:${encodeAnswer(answer.trim())})`)
    .replace(CITATION_PATTERN, (tag, _label, week, page) => `[${tag.slice(1, -1)}](cite:${week ?? ""}:${page})`);
}

// Same allow-list as react-markdown's default, plus the two private schemes used above.
function urlTransform(url: string): string {
  if (url.startsWith("cite:") || url.startsWith("answer:")) return url;
  return /^(https?|mailto|tel):/i.test(url) || url.startsWith("/") || url.startsWith("#") ? url : "";
}

function AnswerToggle({ encoded, onCitationClick }: { encoded: string } & Pick<Props, "onCitationClick">) {
  const [open, setOpen] = useState(false);
  return (
    <span className="block">
      <button
        type="button"
        className="min-h-11 text-sm font-medium text-primary underline underline-offset-4"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Cevabı gizle" : "Cevabı göster"}
      </button>
      {open && (
        <span className="mt-1 block rounded-md bg-muted p-3">
          <Markdown inline content={decodeURIComponent(encoded)} onCitationClick={onCitationClick} />
        </span>
      )}
    </span>
  );
}

export function Markdown({ content, onCitationClick, inline = false }: Props & { inline?: boolean }) {
  // Inline mode (used inside a paragraph) must not emit block elements.
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper className="space-y-3 text-[15px] leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={urlTransform}
        components={{
          p({ children }) {
            return inline ? <span>{children}</span> : <p>{children}</p>;
          },
          a({ href, children }) {
            if (href?.startsWith("answer:")) {
              return <AnswerToggle encoded={href.slice("answer:".length)} onCitationClick={onCitationClick} />;
            }
            if (href?.startsWith("cite:")) {
              const [, week, page] = href.split(":");
              return (
                <button
                  type="button"
                  className="mx-0.5 inline-flex min-h-6 items-center rounded-full bg-primary/10 px-2 text-xs font-medium text-primary hover:bg-primary/20"
                  onClick={() => onCitationClick?.(week ? Number(week) : null, Number(page))}
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                {children}
              </a>
            );
          },
        }}
      >
        {preprocess(content)}
      </ReactMarkdown>
    </Wrapper>
  );
}
