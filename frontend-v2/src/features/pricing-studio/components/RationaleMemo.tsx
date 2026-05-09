import type { MemoData } from '@/types/studio';
import { renderInline } from './renderInline';

interface Props {
  data: MemoData;
}

export function RationaleMemo({ data }: Props) {
  return (
    <div className="ws-memo">
      <div className="ws-memo-head">
        <span className="ws-memo-title">{data.title}</span>
        <span className="ws-memo-edit">click to edit</span>
        <button type="button" className="btn">
          📋 Copy
        </button>
        <button type="button" className="btn">
          ✉ Email to Till
        </button>
        <button type="button" className="btn">
          ⬇ Branded PDF
        </button>
      </div>
      <div className="ws-memo-body" contentEditable suppressContentEditableWarning>
        {data.paragraphs.map((p, i) => (
          <p key={i} className={p.isSig ? 'sig' : undefined}>
            {renderInline(p.body)}
          </p>
        ))}
      </div>
    </div>
  );
}
