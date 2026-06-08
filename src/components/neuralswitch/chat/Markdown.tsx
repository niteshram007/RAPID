"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Check, Copy } from "lucide-react";

type MarkdownRuntimeProps = {
  children: string;
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
  components?: Record<string, React.ComponentType<MarkdownComponentProps>>;
};

type MarkdownComponentProps = {
  children?: React.ReactNode;
  [key: string]: unknown;
};

const ReactMarkdown = dynamic(
  () =>
    import("react-markdown").then(
      (mod) => mod.default as React.ComponentType<MarkdownRuntimeProps>,
    ),
  { ssr: false },
);

function CodeBlock({ children }: MarkdownComponentProps) {
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef<HTMLPreElement>(null);

  const copy = async () => {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group relative">
      <button
        onClick={copy}
        className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background/80 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        title="Copy code"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre ref={ref} className="bg-[#f6f8fa] p-4 dark:bg-[#0d1117]">
        {children}
      </pre>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  const [plugins, setPlugins] = React.useState<{
    remarkPlugins: unknown[];
    rehypePlugins: unknown[];
  }>({
    remarkPlugins: [],
    rehypePlugins: [],
  });

  React.useEffect(() => {
    let mounted = true;
    Promise.all([import("remark-gfm"), import("rehype-highlight")]).then(
      ([remarkGfm, rehypeHighlight]) => {
        if (!mounted) {
          return;
        }
        setPlugins({
          remarkPlugins: [remarkGfm.default],
          rehypePlugins: [rehypeHighlight.default],
        });
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="prose-chat text-sm">
      <ReactMarkdown
        remarkPlugins={plugins.remarkPlugins}
        rehypePlugins={plugins.rehypePlugins}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
