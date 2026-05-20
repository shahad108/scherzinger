import { Fragment, type ReactNode } from 'react';

const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export function renderInline(text: string): ReactNode {
  const parts = text.split(TOKEN_RE);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith('*') && p.endsWith('*'))
      return <i key={i}>{p.slice(1, -1)}</i>;
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i}>{p.slice(1, -1)}</code>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
