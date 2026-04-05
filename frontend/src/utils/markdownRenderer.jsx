import React from 'react';

/**
 * Lightweight markdown-to-JSX renderer for chat messages.
 * Handles: headings, bold, italic, tables, ordered/unordered lists,
 * horizontal rules, and inline formatting.
 */

function parseInline(text) {
  if (!text) return text;
  const parts = [];
  // Process bold, italic, and bold-italic inline
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // bold italic ***text***
      parts.push(<strong key={match.index}><em>{match[2]}</em></strong>);
    } else if (match[3]) {
      // bold **text**
      parts.push(<strong key={match.index}>{match[3]}</strong>);
    } else if (match[4]) {
      // italic *text*
      parts.push(<em key={match.index}>{match[4]}</em>);
    } else if (match[5]) {
      // bold __text__
      parts.push(<strong key={match.index}>{match[5]}</strong>);
    } else if (match[6]) {
      // italic _text_
      parts.push(<em key={match.index}>{match[6]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

function isTableBlock(lines, startIdx) {
  if (startIdx + 1 >= lines.length) return false;
  const row1 = lines[startIdx].trim();
  const row2 = lines[startIdx + 1].trim();
  return row1.includes('|') && /^\|?[\s-:|]+\|/.test(row2);
}

function parseTable(lines) {
  const parseRow = (line) =>
    line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).filter(l => l.trim() && l.includes('|')).map(parseRow);

  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50">
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 font-semibold text-slate-600 border-b-2 border-slate-200 whitespace-nowrap">
                {parseInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 hover:bg-slate-50/50">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  let listBuffer = [];
  let listType = null; // 'ul' or 'ol'

  function flushList() {
    if (listBuffer.length === 0) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    const cls = listType === 'ol'
      ? 'list-decimal list-inside space-y-1.5 my-2 text-sm text-slate-700'
      : 'list-disc list-inside space-y-1.5 my-2 text-sm text-slate-700';
    elements.push(
      <Tag key={`list-${elements.length}`} className={cls}>
        {listBuffer.map((item, j) => (
          <li key={j} className="leading-relaxed">{parseInline(item)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="my-4 border-slate-200" />);
      i++;
      continue;
    }

    // Table detection
    if (isTableBlock(lines, i)) {
      flushList();
      const tableLines = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(
        <React.Fragment key={`table-${i}`}>
          {parseTable(tableLines)}
        </React.Fragment>
      );
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const content = parseInline(headingMatch[2]);
      const cls = {
        1: 'text-lg font-bold text-slate-900 mt-5 mb-2',
        2: 'text-base font-bold text-slate-800 mt-4 mb-2',
        3: 'text-sm font-bold text-slate-700 mt-3 mb-1.5',
        4: 'text-sm font-semibold text-slate-600 mt-2 mb-1',
      }[level];
      elements.push(
        React.createElement(`h${level}`, { key: `h-${i}`, className: cls }, content)
      );
      i++;
      continue;
    }

    // Ordered list (1. or 1) )
    const olMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(olMatch[1]);
      i++;
      continue;
    }

    // Unordered list (- or * or •)
    const ulMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(ulMatch[1]);
      i++;
      continue;
    }

    // Empty line
    if (trimmed === '') {
      flushList();
      i++;
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed text-slate-700 my-1">
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  flushList();
  return elements;
}
