import { useState, useEffect, useRef } from 'react';
import StructuredReplyRenderer from '../components/chat/StructuredReplyRenderer';
import { createStreamParser } from '../utils/structuredReply/streamParser';
import { FIXTURES, REPLAY_STREAM } from './chatDebugFixtures';

export default function ChatDebug() {
  const [pick, setPick] = useState('comparison_cards');
  const [replay, setReplay] = useState({ blocks: [], status: [], finalized: false });
  const parserRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startReplay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    parserRef.current = createStreamParser();
    setReplay({ blocks: [], status: [], finalized: false });
    let i = 0;
    const str = REPLAY_STREAM;
    timerRef.current = setInterval(() => {
      if (i >= str.length) {
        clearInterval(timerRef.current);
        const r = parserRef.current.finalize();
        setReplay({ blocks: r.blocks, status: r.status, finalized: true });
        return;
      }
      const chunk = str.slice(i, i + 3);
      i += 3;
      const r = parserRef.current.feed(chunk);
      setReplay({ blocks: r.blocks, status: r.status, finalized: false });
    }, 30);
  };

  const onEntityClick = ({ entityType, id }) => {
    alert(`Entity click: ${entityType} ${id}`);
  };

  const fixture = FIXTURES[pick];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Chat Debug</h1>

      <section>
        <h2 className="text-sm font-semibold mb-2">Block picker</h2>
        <select
          value={pick}
          onChange={e => setPick(e.target.value)}
          className="text-sm border rounded px-2 py-1"
        >
          {Object.keys(FIXTURES).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <div className="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
          <StructuredReplyRenderer blocks={fixture.blocks} finalized onEntityClick={onEntityClick} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Stream replay</h2>
        <button
          onClick={startReplay}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Replay ComparisonCards stream
        </button>
        <div className="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
          <StructuredReplyRenderer
            blocks={replay.blocks}
            status={replay.status}
            finalized={replay.finalized}
            onEntityClick={onEntityClick}
          />
        </div>
      </section>
    </div>
  );
}
