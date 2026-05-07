import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Lexer } from 'marked';
import type { ChatMessage } from './chat-shared';
import { isToolResultOnlyMessage as isToolResultOnlyMessageShared } from './chat-shared';

type MarkdownContentProps = {
  text: string;
  className?: string;
  highlightQuery?: string;
};

type MarkdownToken = {
  type: string;
  raw?: string;
  text?: string;
  lang?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  ordered?: boolean;
  depth?: number;
  href?: string;
  title?: string | null;
  header?: MarkdownToken[];
  rows?: MarkdownToken[][];
  align?: Array<'center' | 'left' | 'right' | null>;
  escaped?: boolean;
  task?: boolean;
  checked?: boolean;
};

export const isToolResultOnlyMessage = isToolResultOnlyMessageShared;

function isSafeHref(rawHref: string): boolean {
  const trimmed = rawHref.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, 'https://antseed.invalid');
    const protocol = parsed.protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function splitHighlightedText(text: string, query: string | undefined, keyPrefix: string): ReactNode {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchIndex = 0;

  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index === -1) break;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <mark key={`${keyPrefix}-mark-${matchIndex}`} className="chat-search-mark">
        {text.slice(index, index + trimmedQuery.length)}
      </mark>,
    );
    cursor = index + trimmedQuery.length;
    matchIndex += 1;
  }

  if (matchIndex === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function flattenPlainText(tokens: MarkdownToken[] | undefined): string {
  if (!Array.isArray(tokens) || tokens.length === 0) return '';
  let output = '';
  for (const token of tokens) {
    if (token.type === 'br') {
      output += '\n';
      continue;
    }
    if (Array.isArray(token.tokens) && token.tokens.length > 0) {
      output += flattenPlainText(token.tokens);
      continue;
    }
    output += normalizeText(token.text ?? token.raw);
  }
  return output;
}

function renderInlineTokens(tokens: MarkdownToken[] | undefined, keyPrefix: string, highlightQuery?: string): ReactNode[] {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  return tokens.map((token, index) => renderInlineToken(token, `${keyPrefix}-${index}`, highlightQuery));
}

function renderInlineToken(token: MarkdownToken, key: string, highlightQuery?: string): ReactNode {
  switch (token.type) {
    case 'text':
      if (Array.isArray(token.tokens) && token.tokens.length > 0) {
        return <Fragment key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</Fragment>;
      }
      return <Fragment key={key}>{splitHighlightedText(normalizeText(token.text), highlightQuery, key)}</Fragment>;
    case 'escape':
      return <Fragment key={key}>{splitHighlightedText(normalizeText(token.text), highlightQuery, key)}</Fragment>;
    case 'strong':
      return <strong key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</strong>;
    case 'em':
      return <em key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</em>;
    case 'codespan':
      return (
        <code key={key} className="chat-inline-code">
          {splitHighlightedText(normalizeText(token.text), highlightQuery, key)}
        </code>
      );
    case 'br':
      return <br key={key} />;
    case 'del':
      return <del key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</del>;
    case 'link': {
      const href = normalizeText(token.href);
      const content = renderInlineTokens(token.tokens, key, highlightQuery);
      if (!isSafeHref(href)) {
        return (
          <span key={key} className="chat-inline-link-invalid">
            {content}
          </span>
        );
      }
      return (
        <a
          key={key}
          href={href}
          style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}
          target="_blank"
          rel="noopener noreferrer"
          title={token.title ?? undefined}
        >
          {content}
        </a>
      );
    }
    case 'image': {
      const href = normalizeText(token.href);
      const alt = flattenPlainText(token.tokens) || normalizeText(token.text) || 'Image';
      if (!isSafeHref(href)) {
        return (
          <span key={key} className="chat-inline-link-invalid">
            {alt}
          </span>
        );
      }
      return <img key={key} src={href} alt={alt} className="chat-inline-image" />;
    }
    default:
      if (Array.isArray(token.tokens) && token.tokens.length > 0) {
        return <Fragment key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</Fragment>;
      }
      return <Fragment key={key}>{splitHighlightedText(normalizeText(token.text ?? token.raw), highlightQuery, key)}</Fragment>;
  }
}

function renderBlockTokens(tokens: MarkdownToken[], keyPrefix: string, highlightQuery?: string): ReactNode[] {
  return tokens.map((token, index) => renderBlockToken(token, `${keyPrefix}-${index}`, highlightQuery));
}

function renderTableCell(token: MarkdownToken, key: string, highlightQuery?: string): ReactNode {
  if (Array.isArray(token.tokens) && token.tokens.length > 0) {
    return <Fragment key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</Fragment>;
  }
  return <Fragment key={key}>{splitHighlightedText(normalizeText(token.text ?? token.raw), highlightQuery, key)}</Fragment>;
}

function renderListItemContent(token: MarkdownToken, key: string, highlightQuery?: string): ReactNode {
  if (Array.isArray(token.tokens) && token.tokens.length > 0) {
    const hasBlockTokens = token.tokens.some((child) =>
      ['paragraph', 'space', 'text', 'strong', 'em', 'codespan', 'link', 'del', 'br'].includes(child.type) === false);
    if (hasBlockTokens) {
      return <>{renderBlockTokens(token.tokens, key, highlightQuery)}</>;
    }
    return <>{renderInlineTokens(token.tokens, key, highlightQuery)}</>;
  }
  return splitHighlightedText(normalizeText(token.text ?? token.raw), highlightQuery, key);
}

function CodeBlock({ code, lang, highlightQuery }: { code: string; lang?: string; highlightQuery?: string }) {
  const [copied, setCopied] = useState(false);
  const langLabel = normalizeText(lang).trim() || 'code';

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="chat-code-container">
      <div className="chat-code-header">
        <span className="code-lang">{langLabel}</span>
        <button className="chat-code-copy-btn" type="button" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{splitHighlightedText(code, highlightQuery, 'code')}</code>
      </pre>
    </div>
  );
}

function renderBlockToken(token: MarkdownToken, key: string, highlightQuery?: string): ReactNode {
  switch (token.type) {
    case 'space':
      return null;
    case 'paragraph':
      return <p key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</p>;
    case 'text':
      if (Array.isArray(token.tokens) && token.tokens.length > 0) {
        return <p key={key}>{renderInlineTokens(token.tokens, key, highlightQuery)}</p>;
      }
      return <p key={key}>{splitHighlightedText(normalizeText(token.text), highlightQuery, key)}</p>;
    case 'heading': {
      const depth = Math.min(Math.max(Number(token.depth) || 1, 1), 6);
      const children = renderInlineTokens(token.tokens, key, highlightQuery);
      if (depth === 1) return <h1 key={key}>{children}</h1>;
      if (depth === 2) return <h2 key={key}>{children}</h2>;
      if (depth === 3) return <h3 key={key}>{children}</h3>;
      if (depth === 4) return <h4 key={key}>{children}</h4>;
      if (depth === 5) return <h5 key={key}>{children}</h5>;
      return <h6 key={key}>{children}</h6>;
    }
    case 'code':
      return <CodeBlock key={key} code={normalizeText(token.text)} lang={token.lang} highlightQuery={highlightQuery} />;
    case 'blockquote':
      return <blockquote key={key}>{renderBlockTokens(token.tokens ?? [], key, highlightQuery)}</blockquote>;
    case 'hr':
      return <hr key={key} />;
    case 'list': {
      const ListTag = token.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={key} className="chat-md-list">
          {(token.items ?? []).map((item, index) => (
            <li key={`${key}-item-${index}`} className="chat-md-li">
              {item.task ? (
                <label className="chat-task-item">
                  <input type="checkbox" checked={Boolean(item.checked)} readOnly />
                  <span>{renderListItemContent(item, `${key}-task-${index}`, highlightQuery)}</span>
                </label>
              ) : (
                renderListItemContent(item, `${key}-item-content-${index}`, highlightQuery)
              )}
            </li>
          ))}
        </ListTag>
      );
    }
    case 'table':
      return (
        <div key={key} className="chat-table-wrap">
          <table className="chat-md-table">
            <thead>
              <tr>
                {(token.header ?? []).map((cell, index) => (
                  <th key={`${key}-head-${index}`} align={token.align?.[index] ?? undefined}>
                    {renderTableCell(cell, `${key}-head-cell-${index}`, highlightQuery)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(token.rows ?? []).map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-row-${rowIndex}-cell-${cellIndex}`} align={token.align?.[cellIndex] ?? undefined}>
                      {renderTableCell(cell, `${key}-row-${rowIndex}-cell-content-${cellIndex}`, highlightQuery)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      if (Array.isArray(token.tokens) && token.tokens.length > 0) {
        return <Fragment key={key}>{renderBlockTokens(token.tokens, key, highlightQuery)}</Fragment>;
      }
      return <p key={key}>{splitHighlightedText(normalizeText(token.text ?? token.raw), highlightQuery, key)}</p>;
  }
}

export function MarkdownContent({ text, className = 'chat-bubble-content', highlightQuery }: MarkdownContentProps) {
  const tokens = useMemo(() => Lexer.lex(text, { gfm: true, breaks: true }) as MarkdownToken[], [text]);
  return <div className={className}>{renderBlockTokens(tokens, 'md', highlightQuery)}</div>;
}
