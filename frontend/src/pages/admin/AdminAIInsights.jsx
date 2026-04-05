import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Send, Loader, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import renderMarkdown from '../../utils/markdownRenderer';

const SUGGESTED_QUESTIONS = [
  "What features should we prioritize for the next update?",
  "Is Vivek's engagement increasing or decreasing?",
  "What are the most common AI chat topics?",
  "Compare this week vs last week usage patterns",
  "Which pages need improvement or better onboarding?",
  "What does Vivek care about most on the Products page?",
];

// ─── SSE Stream Parser ───────────────────────────────────────────
async function streamResponse(url, options, onChunk, onDone) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(fullText);
          }
        } catch { /* skip non-JSON lines */ }
      }
    }
  }
  onDone(fullText);
}

// ─── Trend Alerts ────────────────────────────────────────────────
function TrendAlerts({ trends }) {
  if (!trends?.length) return null;

  return (
    <div className="space-y-2">
      {trends.map((t, i) => {
        const isUp = t.pctChange > 0;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: isUp ? '#f0fdf4' : '#fef2f2', border: `1px solid ${isUp ? '#bbf7d0' : '#fecaca'}` }}
          >
            {isUp ? <TrendingUp size={16} className="text-green-600 flex-shrink-0" /> : <TrendingDown size={16} className="text-red-600 flex-shrink-0" />}
            <span className="text-xs font-medium" style={{ color: isUp ? '#166534' : '#991b1b' }}>{t.message}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Weekly Report Card ──────────────────────────────────────────
function WeeklyReportCard({ report, loading, onRefresh }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="h-1" style={{ background: 'linear-gradient(90deg, #7C3AED, #C4B5FD, #7C3AED)' }} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: '#7C3AED' }} />
            <h3 className="text-sm font-bold" style={{ color: '#1a1a2e' }}>AI-Generated Weekly Report</h3>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: '#f5f3ff', color: '#7C3AED' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Generating...' : 'Regenerate'}
          </button>
        </div>

        {loading && !report ? (
          <div className="flex items-center gap-3 py-12 justify-center">
            <Loader size={20} className="animate-spin text-purple-400" />
            <span className="text-sm text-slate-500">Analyzing Vivek's usage data...</span>
          </div>
        ) : report ? (
          <div className="prose prose-sm max-w-none text-slate-700 [&_strong]:text-slate-900 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-800 [&_h3]:text-sm [&_h3]:font-bold [&_h1]:text-base [&_h1]:font-bold [&_li]:text-sm [&_p]:text-sm [&_ol]:space-y-1 [&_ul]:space-y-1">
            {renderMarkdown(report)}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-slate-500">Click "Regenerate" to generate a fresh weekly report</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Question Interface ──────────────────────────────────────────
function QuestionInterface({ answer, loading, onAsk }) {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  const handleSend = () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    onAsk(q);
  };

  return (
    <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Ask About Vivek's Behavior</h3>

      {/* Input */}
      <div className="flex items-end gap-2 mb-4">
        <textarea
          ref={textareaRef}
          className="flex-1 resize-none bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          style={{ border: '1px solid #e5e7eb' }}
          placeholder="What does Vivek focus on most?"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-colors disabled:opacity-30"
          style={{ background: '#7C3AED' }}
        >
          {loading ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {/* Suggested questions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => { setInput(''); onAsk(q); }}
            disabled={loading}
            className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-purple-50 disabled:opacity-50"
            style={{ background: '#f5f3ff', color: '#7C3AED' }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Answer */}
      {(loading || answer) && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
          {loading && !answer ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader size={14} className="animate-spin" />
              Thinking...
            </div>
          ) : answer ? (
            <div className="prose prose-sm max-w-none text-slate-700 [&_strong]:text-slate-900 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_li]:text-sm [&_p]:text-sm">
              {renderMarkdown(answer)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Main AI Insights Page ───────────────────────────────────────
export default function AdminAIInsights() {
  const [report, setReport] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [trends, setTrends] = useState([]);
  const [answer, setAnswer] = useState('');
  const [answerLoading, setAnswerLoading] = useState(false);

  const generateReport = useCallback(async () => {
    setReportLoading(true);
    setReport('');
    try {
      await streamResponse(
        '/api/admin/insights/report',
        { method: 'GET' },
        (text) => setReport(text),
        () => setReportLoading(false),
      );
    } catch (err) {
      setReport('Failed to generate report. Please try again.');
      setReportLoading(false);
    }
  }, []);

  // Auto-generate on first load
  useEffect(() => { generateReport(); }, [generateReport]);

  const askQuestion = useCallback(async (question) => {
    setAnswerLoading(true);
    setAnswer('');
    try {
      await streamResponse(
        '/api/admin/insights/ask',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        },
        (text) => setAnswer(text),
        () => setAnswerLoading(false),
      );
    } catch (err) {
      setAnswer('Failed to get answer. Please try again.');
      setAnswerLoading(false);
    }
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Trend Alerts */}
      {trends.length > 0 && <TrendAlerts trends={trends} />}

      {/* Weekly Report */}
      <WeeklyReportCard report={report} loading={reportLoading} onRefresh={generateReport} />

      {/* Question Interface */}
      <QuestionInterface answer={answer} loading={answerLoading} onAsk={askQuestion} />
    </div>
  );
}
