"use client";

import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CITATION_PATTERN } from "@/lib/rag/citations";

type Props = {
  content: string;
  onCitationClick?: (week: number | null, page: number) => void;
};

// Turns "[H3 · s.12]" tags into markdown links with a private "cite:" scheme, rendered as badges below.
function linkifyCitations(text: string): string {
  return text.replace(CITATION_PATTERN, (tag, _label, week, page) => {
    const inner = tag.slice(1, -1);
    return `[${inner}](cite:${week ?? ""}:${page})`;
  });
}

export function Markdown({ content, onCitationClick }: Props) {
  return (
    <div className="prose-chat space-y-3 text-[15px] leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => (url.startsWith("cite:") ? url : defaultUrlTransform(url))}
        components={{
          a({ href, children }) {
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
        {linkifyCitations(content)}
      </ReactMarkdown>
    </div>
  );
}

// Same allow-list as react-markdown's default: only web-safe protocols pass through.
function defaultUrlTransform(url: string): string {
  return /^(https?|mailto|tel):/i.test(url) || url.startsWith("/") || url.startsWith("#") ? url : "";
}
