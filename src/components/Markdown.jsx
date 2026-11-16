/* eslint-disable react-refresh/only-export-components -- memoized default export */
/* eslint-disable react/prop-types */
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { useCopy } from "../hooks";

const hastText = (node) =>
  node?.type === "text" ? node.value : (node?.children ?? []).map(hastText).join("");

function CodeBlock({ node, children }) {
  const [copied, copy] = useCopy();
  const code = node?.children?.find((c) => c.tagName === "code");
  const classes = code?.properties?.className ?? [];
  const lang = String(classes.find((c) => String(c).startsWith("language-")) ?? "").replace("language-", "");

  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang || "code"}</span>
        <button type="button" onClick={() => copy(hastText(code).replace(/\n$/, ""))}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components = {
  pre: CodeBlock,
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node, ...props }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
};

const rehypePlugins = [[rehypeHighlight, { detect: true }]];
const remarkPlugins = [remarkGfm];

function Markdown({ text }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
