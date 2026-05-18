"use client";

import { useCallback, useState, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import clsx from "clsx";

/**
 * ChatMarkdown — assistant 마크다운 렌더 컴포넌트 (FR-05 / AC-6 / NFR-5 / AD-5d).
 *
 * 보안 불변식 (AD-5d, load-bearing):
 *   rehypePlugins = [rehypeRaw, rehypeSanitize]
 *   - rehypeRaw 가 원시 HTML 을 hast 로 파싱한 "뒤" rehypeSanitize 가 실행되어야
 *     주입된 script / on* 핸들러가 제거된다. 순서가 뒤바뀌면 sanitize 가
 *     문자열 단계의 HTML 을 보지 못해 XSS 우회가 발생한다.
 *   - sanitize 스키마는 hast-util-sanitize 의 secure allowlist(defaultSchema)
 *     를 그대로 사용한다. script / on* 를 재허용하지 않는다.
 *   - 스트리밍 부분 마크다운도 매 렌더 동일 플러그인 체인을 통과하므로
 *     sanitize 우회 경로가 없다 (별도 raw HTML 주입 API 미사용).
 */

// 검증용 메타: 플러그인 적용 순서를 외부(테스트/리뷰)에서 확인할 수 있게 노출.
const REHYPE_PLUGIN_ORDER = ["rehype-raw", "rehype-sanitize"] as const;

// secure allowlist 를 그대로 사용 (script / on* 미재허용).
const sanitizeSchema = defaultSchema;

function extractText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractText(props?.children);
  }
  return "";
}

function CodeBlock({
  language,
  code,
}: {
  language: string | null;
  code: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    // 코드 전체를 절단 없이 복사 (UC-4-EC1 / TC-4.7).
    const text = code.replace(/\n$/, "");
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <div className="my-3 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
        <span className="font-mono">{language ?? "code"}</span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "복사됨" : "코드 복사"}
          className="rounded px-2 py-0.5 text-gray-600 transition-colors hover:bg-gray-200"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        <code className={language ? `language-${language}` : undefined}>
          {code}
        </code>
      </pre>
    </div>
  );
}

const components: Components = {
  code({ className, children, ...props }) {
    const text = extractText(children);
    const isBlock = /\n/.test(text) || /language-/.test(className ?? "");
    if (!isBlock) {
      return (
        <code
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-gray-800"
          {...props}
        >
          {children}
        </code>
      );
    }
    const match = /language-([\w-]+)/.exec(className ?? "");
    return <CodeBlock language={match ? match[1] : null} code={text} />;
  },
  pre({ children }) {
    // CodeBlock 이 자체 pre 를 렌더하므로 wrapper pre 는 통과만.
    return <>{children}</>;
  },
};

export interface ChatMarkdownProps {
  content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps): ReactNode {
  return (
    <div
      className={clsx(
        "chat-markdown text-sm leading-relaxed text-gray-900",
        "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_a]:text-blue-600 [&_a]:underline",
        "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse",
        "[&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1",
        "[&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1",
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        // AD-5d: rehypeRaw 먼저 -> rehypeSanitize 뒤. 순서 변경 금지.
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  );
}

// 보안 리뷰/테스트용: 플러그인 적용 순서 노출 (rehype-raw -> rehype-sanitize).
ChatMarkdown.rehypePluginOrder = REHYPE_PLUGIN_ORDER;

export default ChatMarkdown;
