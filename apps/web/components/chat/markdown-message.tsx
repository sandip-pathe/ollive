import type { ReactNode } from "react";

type MarkdownMessageProps = {
  content: string;
  tone?: "assistant" | "user";
};

type TextToken = string | ReactNode;

const BLOCK_START = /^(#{1,4}\s|[-*+]\s+|\d+\.\s+|>\s?|```)/;
const SAFE_LINK = /^(https?:\/\/|mailto:|\/|#)/i;

function parseInline(text: string, keyPrefix = "i"): ReactNode[] {
  const tokenPattern =
    /(`[^`]+`|\*\*[^*\n][\s\S]*?[^*\n]\*\*|\*[^*\n][^*\n]*\*|\[[^\]\n]+\]\([^) \n]+\))/g;
  const nodes: TextToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-[#ece7da] px-1.5 py-0.5 font-mono text-[0.92em] text-[#514838]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-[#1f1e1b]">
          {parseInline(token.slice(2, -2), `${key}-strong`)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={key} className="italic">
          {parseInline(token.slice(1, -1), `${key}-em`)}
        </em>,
      );
    } else {
      const link = token.match(/^\[([^\]\n]+)\]\(([^) \n]+)\)$/);
      if (link && SAFE_LINK.test(link[2])) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target={link[2].startsWith("http") ? "_blank" : undefined}
            rel={link[2].startsWith("http") ? "noreferrer" : undefined}
            className="font-medium text-[#755d1b] underline decoration-[#cdbb76] underline-offset-4 hover:text-[#4e3d12]"
          >
            {parseInline(link[1], `${key}-link`)}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.map((node, index) =>
    typeof node === "string" ? <span key={`${keyPrefix}-t-${index}`}>{node}</span> : node,
  );
}

function collectParagraph(lines: string[], startIndex: number) {
  const paragraph: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || BLOCK_START.test(line.trim())) break;
    paragraph.push(line.trim());
    index += 1;
  }

  return { text: paragraph.join(" "), nextIndex: index };
}

function renderBlocks(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      blocks.push(
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-xl border border-[#ded8c9] bg-[#efede6] p-4 text-sm leading-6 text-[#2c2923]"
        >
          <code className="font-mono">{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      const className =
        level <= 2
          ? "pt-2 text-xl font-semibold leading-7 text-[#201f1b]"
          : "pt-1 text-base font-semibold leading-7 text-[#2b2924]";
      blocks.push(
        <Tag key={`heading-${index}`} className={className}>
          {parseInline(heading[2], `heading-${index}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="border-l-2 border-[#c9b66f] pl-4 text-[#5e584b]"
        >
          {parseInline(quoteLines.join(" "), `quote-${index}`)}
        </blockquote>,
      );
      continue;
    }

    const unordered = /^[-*+]\s+(.+)$/.test(line);
    const ordered = /^\d+\.\s+(.+)$/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      const marker = ordered ? /^\d+\.\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].trim().match(marker);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={`list-${index}`}
          className={`${ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6`}
        >
          {items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`} className="pl-1">
              {parseInline(item, `list-${index}-${itemIndex}`)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    const paragraph = collectParagraph(lines, index);
    blocks.push(
      <p key={`p-${index}`} className="break-words">
        {parseInline(paragraph.text, `p-${index}`)}
      </p>,
    );
    index = paragraph.nextIndex;
  }

  return blocks;
}

export function MarkdownMessage({ content, tone = "assistant" }: MarkdownMessageProps) {
  return (
    <div
      className={[
        "space-y-4 break-words text-[16px] leading-8",
        tone === "assistant" ? "text-[#2b2b2b]" : "text-[#2e2d2a]",
      ].join(" ")}
    >
      {content.trim() ? renderBlocks(content) : null}
    </div>
  );
}
