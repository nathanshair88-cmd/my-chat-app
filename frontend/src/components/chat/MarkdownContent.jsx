import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownContent({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    code: ({ children, className }) => <code className={`markdown-code ${className || ''}`}>{children}</code>,
    pre: ({ children }) => <pre className="markdown-pre">{children}</pre>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">{children}</a>,
  }}>{content}</ReactMarkdown>;
}
