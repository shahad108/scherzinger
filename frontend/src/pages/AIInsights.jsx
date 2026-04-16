import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  Send, Bot, Plus, Loader, Square, RotateCcw,
  ChevronDown, ChevronUp, MessageSquare, Lightbulb,
  ThumbsUp, ThumbsDown, PanelLeftClose, PanelLeftOpen, Zap,
  Trash2, History,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Header from '../components/Header';
import ChatChart from '../components/ChatChart';
import IntelligenceFeed from '../components/IntelligenceFeed';
import InsightReportSlideOver from '../components/InsightReportSlideOver';
import { useChat } from '../context/ChatContext';
import { useLanguage } from '../context/LanguageContext';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { translations } from '../i18n/translations';
import { streamChat } from '../utils/openrouter';
import { SYSTEM_PROMPT } from '../utils/systemPrompt';
import { generateIntelligenceFeed } from '../utils/insightsFeedEngine';
import { generateDynamicPrompts, generateQuickPrompts } from '../utils/dynamicPrompts';
import { quickChat } from '../utils/openrouter';
import renderMarkdown from '../utils/markdownRenderer';
import { colors } from '../utils/designTokensV2';
import { BRAND, IS_DEMO } from '../utils/brand';

const DETAIL_ANALYSIS_INSTRUCTION = `
The user opened the dedicated AI Insights screen from "View Detailed Analysis".

Use any prior mini-chat messages only as hidden context. Do not mention the handoff mechanics.
Provide a deeper, decision-ready answer to the user's latest question.
When the question involves comparison, trend, distribution, ranking, forecast, or performance, include exactly one valid \`\`\`chart block.
End with a numbered list of concrete recommended actions tailored to ${BRAND.tailoredTo}.
`;

// ── Conversation helpers ──

const STORAGE_KEY = 'pryzm-ai-conversations';
const ACTIVE_CONV_KEY = 'pryzm-ai-active-conv';
const MAX_STORED_CONVERSATIONS = 50;

function createConversationId() {
  return globalThis.crypto?.randomUUID?.() ?? `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createConversation(overrides = {}) {
  return {
    id: createConversationId(),
    title: 'New Chat',
    messages: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function buildConversationTitle(text) {
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

function sanitizeHistoryMessages(messages = []) {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* ignore corrupt data */ }
  return null;
}

function saveConversations(conversations) {
  try {
    // Keep only the most recent conversations and limit message size
    const toStore = conversations.slice(0, MAX_STORED_CONVERSATIONS).map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt || Date.now(),
      messages: c.messages.filter((m) => m.content && m.content.trim()),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch { /* localStorage full — silently fail */ }
}

function loadActiveConvId() {
  try { return localStorage.getItem(ACTIVE_CONV_KEY) || null; } catch { return null; }
}

function saveActiveConvId(id) {
  try { localStorage.setItem(ACTIVE_CONV_KEY, id); } catch { /* ignore */ }
}

function parseMessageContent(content) {
  const parts = [];
  const chartRegex = /```chart\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let match;

  while ((match = chartRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    try {
      const spec = JSON.parse(match[1]);
      parts.push({ type: 'chart', spec });
    } catch {
      parts.push({ type: 'text', content: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', content }];
}

function formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ──

export default function AIInsights() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { detailedAnalysisHandoff, clearDetailedAnalysisHandoff, pageContext } = useChat();
  const { t, lang } = useLanguage();
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  // Intelligence feed — re-generate when language changes so titles/summaries follow
  const feedReports = useMemo(() => generateIntelligenceFeed(t), [t]);
  const dynamicPrompts = useMemo(() => generateDynamicPrompts(feedReports, 8, t), [feedReports, t]);
  const quickPrompts = useMemo(() => generateQuickPrompts(feedReports, t), [feedReports, t]);
  const [expandedReport, setExpandedReport] = useState(null);
  const [feedCollapsed, setFeedCollapsed] = useState(() => {
    try { return localStorage.getItem('insights-feed-collapsed') === 'true'; } catch { return false; }
  });

  const toggleFeed = useCallback(() => {
    setFeedCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('insights-feed-collapsed', String(next));
      return next;
    });
  }, []);

  const criticalCount = useMemo(
    () => feedReports.filter((r) => r.severity >= 75).length,
    [feedReports],
  );

  // Conversations — loaded from localStorage, persisted on change
  const [conversations, setConversations] = useState(() => {
    const stored = loadConversations();
    if (stored && stored.length > 0) return stored;
    return [createConversation()];
  });
  const [activeConvId, setActiveConvId] = useState(() => {
    const storedId = loadActiveConvId();
    const stored = loadConversations();
    if (storedId && stored?.some((c) => c.id === storedId)) return storedId;
    return conversations[0]?.id;
  });
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [lastUserMsg, setLastUserMsg] = useState(null);
  const [showRecentChats, setShowRecentChats] = useState(false);
  const [chatFeedback, setChatFeedback] = useState({}); // msgIndex -> 'up'|'down'
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const conversationsRef = useRef(conversations);
  const activeConvIdRef = useRef(activeConvId);
  const isStreamingRef = useRef(isStreaming);
  const processedEntryIdsRef = useRef(new Set());
  const lastRequestRef = useRef(null);

  // Persist conversations to localStorage whenever they change
  useEffect(() => {
    conversationsRef.current = conversations;
    if (!isStreamingRef.current) {
      saveConversations(conversations);
    }
  }, [conversations]);

  // Also save when streaming finishes (to capture the final assistant message)
  useEffect(() => {
    if (!isStreaming && conversationsRef.current.length > 0) {
      saveConversations(conversationsRef.current);
    }
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
    saveActiveConvId(activeConvId);
  }, [activeConvId]);

  const activeConv = conversations.find((c) => c.id === activeConvId) || conversations[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConv?.messages]);

  // Turn count nudge
  const turnCount = activeConv?.messages.filter((m) => m.role === 'user').length ?? 0;
  const showTurnNudge = turnCount >= 8;

  // AI-generated follow-up suggestions — fires after each response completes
  const [followUpSuggestions, setFollowUpSuggestions] = useState([]);
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const followUpAbortRef = useRef(null);
  const prevStreamingRef = useRef(false);

  // Track message count to detect when a new response is complete
  const messageCount = activeConv?.messages?.length ?? 0;

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    // Only trigger when streaming transitions from true → false (response just finished)
    if (isStreaming || !wasStreaming) return;

    const msgs = activeConv?.messages ?? [];
    if (msgs.length < 2) return;

    // Find last user + assistant pair
    let lastUser = '';
    let lastAssistant = '';
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!lastAssistant && msgs[i].role === 'assistant' && msgs[i].content?.trim()) {
        lastAssistant = msgs[i].content;
      }
      if (!lastUser && msgs[i].role === 'user' && msgs[i].content?.trim()) {
        lastUser = msgs[i].content;
      }
      if (lastUser && lastAssistant) break;
    }
    if (!lastAssistant || !lastUser) return;

    // Cancel any pending follow-up request
    followUpAbortRef.current?.abort();
    const controller = new AbortController();
    followUpAbortRef.current = controller;
    setFollowUpsLoading(true);

    // Truncate assistant response to save tokens
    const truncated = lastAssistant.length > 800 ? lastAssistant.slice(0, 800) + '...' : lastAssistant;

    quickChat([
      {
        role: 'system',
        content: `You generate follow-up questions for a business analytics conversation at ${BRAND.companyDescriptionShort}. Based on the user question and AI answer, suggest exactly 3 short follow-up questions the user might want to ask next. Each question should be specific — reference customer IDs, article numbers, commodity groups, or metrics from the conversation. Return ONLY a JSON array of 3 strings. Example: ["Question 1?","Question 2?","Question 3?"]`,
      },
      { role: 'user', content: `User asked: "${lastUser}"\n\nAI responded: "${truncated}"\n\nGenerate 3 follow-up questions:` },
    ], { maxTokens: 250, signal: controller.signal })
      .then((raw) => {
        if (controller.signal.aborted) return;
        setFollowUpsLoading(false);
        // Parse JSON — handle possible markdown wrapping
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        try {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFollowUpSuggestions(parsed.slice(0, 3).map(String));
            return;
          }
        } catch { /* try fallback */ }
        // Fallback: extract quoted strings
        const matches = [...cleaned.matchAll(/"([^"]{10,})"/g)].map((m) => m[1]);
        if (matches.length > 0) {
          setFollowUpSuggestions(matches.slice(0, 3));
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setFollowUpsLoading(false);
        console.warn('[FollowUps] AI generation failed, using fallback:', err.message);
        // Fallback: generate basic follow-ups from the conversation content
        const fallbacks = [];
        const custMatch = lastAssistant.match(/(?:Customer|customer)\s*#?(\d{5,6})/);
        const artMatch = lastAssistant.match(/(?:article|Article)\s*#?(\d{5,6}(?:-[A-Z])?)/);
        if (custMatch) {
          fallbacks.push(`Show me the full revenue history for Customer ${custMatch[1]}`);
          fallbacks.push(`What products does Customer ${custMatch[1]} buy the most?`);
          fallbacks.push(`How does Customer ${custMatch[1]} compare to similar accounts?`);
        } else if (artMatch) {
          fallbacks.push(`What is the margin trend for article ${artMatch[1]}?`);
          fallbacks.push(`Should we reprice or discontinue article ${artMatch[1]}?`);
          fallbacks.push(`Which customers buy article ${artMatch[1]}?`);
        } else {
          fallbacks.push('Can you go deeper on the biggest risk you identified?');
          fallbacks.push('What are the top 3 actions I should take based on this?');
          fallbacks.push('How does this compare to last year?');
        }
        setFollowUpSuggestions(fallbacks);
      });

    return () => controller.abort();
  }, [isStreaming, messageCount, activeConvId]);

  // ── Send message ──

  const sendToConversation = useCallback(async (rawText, options = {}) => {
    const msg = (rawText ?? '').trim();
    if (!msg || isStreamingRef.current) return false;

    const conversationId = options.conversationId ?? activeConvIdRef.current;
    const currentConversation = conversationsRef.current.find((c) => c.id === conversationId);
    const priorVisibleMessages = options.visibleMessages ?? currentConversation?.messages ?? [];
    const historyMessages = sanitizeHistoryMessages(options.historyMessages ?? priorVisibleMessages);
    const nextTitle = options.title
      ?? (priorVisibleMessages.some((m) => m.role === 'user')
        ? currentConversation?.title || 'New Chat'
        : buildConversationTitle(msg));

    const userMessage = { role: 'user', content: msg };
    const assistantPlaceholder = { role: 'assistant', content: '' };

    setInput('');
    setError(null);
    setLastUserMsg(msg);
    setFollowUpSuggestions([]); // clear stale follow-ups while new response streams
    setActiveConvId(conversationId);
    setIsStreaming(true);
    isStreamingRef.current = true;

    lastRequestRef.current = {
      msg, conversationId, visibleMessages: priorVisibleMessages,
      historyMessages, additionalInstructions: options.additionalInstructions, title: nextTitle,
    };

    setConversations((prev) => {
      const nextConv = {
        ...(prev.find((c) => c.id === conversationId) || createConversation({ id: conversationId })),
        id: conversationId,
        title: nextTitle,
        messages: [...priorVisibleMessages, userMessage, assistantPlaceholder],
      };
      const idx = prev.findIndex((c) => c.id === conversationId);
      if (idx === -1) return [nextConv, ...prev];
      const updated = [...prev];
      updated[idx] = nextConv;
      return updated;
    });

    const controller = new AbortController();
    abortRef.current = controller;

    const effectiveContext = options.handoffPageContext || pageContext;
    const langDirective = langRef.current === 'de' ? translations.de['ai.directive.de'] : null;
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(langDirective ? [{ role: 'system', content: langDirective }] : []),
      ...historyMessages,
      ...(effectiveContext ? [{ role: 'system', content: effectiveContext }] : []),
      ...(options.additionalInstructions ? [{ role: 'system', content: options.additionalInstructions }] : []),
      userMessage,
    ];

    await streamChat(apiMessages, {
      onChunk(chunk) {
        setConversations((prev) => prev.map((c) => {
          if (c.id !== conversationId) return c;
          const msgs = [...c.messages];
          const last = msgs[msgs.length - 1];
          if (!last || last.role !== 'assistant') return c;
          msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
          return { ...c, messages: msgs };
        }));
      },
      onDone() { setIsStreaming(false); isStreamingRef.current = false; abortRef.current = null; },
      onError(err) {
        setIsStreaming(false); isStreamingRef.current = false; abortRef.current = null;
        if (err.name === 'AbortError') return;
        setError(err.message || 'Something went wrong. Please try again.');
        setConversations((prev) => prev.map((c) => {
          if (c.id !== conversationId) return c;
          const msgs = [...c.messages];
          const last = msgs[msgs.length - 1];
          if (!last || last.role !== 'assistant' || last.content) return c;
          msgs[msgs.length - 1] = { ...last, content: '_Unable to generate a response right now. Use Retry to try again._' };
          return { ...c, messages: msgs };
        }));
      },
      signal: controller.signal,
    });
    return true;
  }, [pageContext]);

  const startDetailedAnalysis = useCallback((question, threadMessages = [], handoffContext = null) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const conversationId = createConversationId();
    setActiveConvId(conversationId);
    sendToConversation(trimmed, {
      conversationId,
      visibleMessages: [],
      historyMessages: threadMessages,
      additionalInstructions: DETAIL_ANALYSIS_INSTRUCTION,
      handoffPageContext: handoffContext,
      title: buildConversationTitle(trimmed),
    });
  }, [sendToConversation]);

  // Handoff from mini-chat
  useEffect(() => {
    const locationHandoff = location.state?.detailedAnalysisHandoff;
    const handoff = detailedAnalysisHandoff?.id ? detailedAnalysisHandoff : locationHandoff;
    if (handoff?.id) {
      if (processedEntryIdsRef.current.has(handoff.id)) return;
      processedEntryIdsRef.current.add(handoff.id);
      if (detailedAnalysisHandoff?.id === handoff.id) clearDetailedAnalysisHandoff();
      const threadMessages = sanitizeHistoryMessages(handoff.threadMessages);
      startDetailedAnalysis(handoff.question || '', threadMessages, handoff.pageContext || null);
      return;
    }
    const q = searchParams.get('q')?.trim();
    if (!q) return;
    const key = `query:${q}`;
    if (processedEntryIdsRef.current.has(key)) return;
    processedEntryIdsRef.current.add(key);
    startDetailedAnalysis(q, []);
  }, [clearDetailedAnalysisHandoff, detailedAnalysisHandoff, location.state, searchParams, startDetailedAnalysis]);

  const handleNewChat = useCallback(() => {
    const newConv = createConversation();
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    setInput('');
    setError(null);
  }, []);

  const handleDeleteConversation = useCallback((convId, e) => {
    e.stopPropagation();
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== convId);
      if (filtered.length === 0) {
        const fresh = createConversation();
        // Switch to the new fresh conversation
        setActiveConvId(fresh.id);
        return [fresh];
      }
      // If we deleted the active conversation, switch to the first remaining one
      if (activeConvIdRef.current === convId) {
        setActiveConvId(filtered[0].id);
      }
      return filtered;
    });
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    isStreamingRef.current = false;
  }, []);

  const handleSend = useCallback((text) => {
    const t = (text ?? input).trim();
    if (!t) return;
    sendToConversation(t);
  }, [input, sendToConversation]);

  const handleRetry = useCallback(() => {
    const lr = lastRequestRef.current;
    if (!lr || isStreamingRef.current) return;
    setError(null);
    setActiveConvId(lr.conversationId);
    setConversations((prev) => prev.map((c) =>
      c.id === lr.conversationId ? { ...c, title: lr.title, messages: [...lr.visibleMessages] } : c
    ));
    sendToConversation(lr.msg, lr);
  }, [sendToConversation]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Ask about a report — preload context into chat
  const handleAskAboutReport = useCallback((report) => {
    const question = `Tell me more about this alert: "${report.title}". ${report.summary}`;
    handleSend(question);
  }, [handleSend]);

  // Auto-submit ?prompt= from URL (e.g. dashboard drill-through). Fires once per mount.
  const { filters: urlFilters, clearFilter: clearUrlFilter } = useUrlFilters();
  const didAutoSubmit = useRef(false);
  useEffect(() => {
    if (didAutoSubmit.current) return;
    if (!urlFilters.prompt) return;
    // Don't clobber an active conversation
    if (activeConv?.messages?.length > 0) { clearUrlFilter('prompt'); return; }
    didAutoSubmit.current = true;
    const promptText = urlFilters.prompt;
    const id = setTimeout(() => {
      handleSend(promptText);
      clearUrlFilter('prompt');
    }, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilters.prompt]);

  const handleChatFeedback = (msgIndex, type) => {
    setChatFeedback((prev) => ({
      ...prev,
      [msgIndex]: prev[msgIndex] === type ? null : type,
    }));
  };

  return (
    <>
      <Header title={t('ai.title')} />

      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        {/* ═══ LEFT PANEL: Intelligence Feed (collapsible) ═══ */}
        <div
          className="min-h-0 border-r border-slate-200 flex flex-col bg-slate-50/30 transition-all duration-300 ease-in-out"
          style={{ width: feedCollapsed ? 48 : '58%', minWidth: feedCollapsed ? 48 : 340 }}
        >
          {feedCollapsed ? (
            /* ── Collapsed strip ── */
            <div className="flex flex-col items-center py-4 gap-3 h-full">
              <button
                onClick={toggleFeed}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors shadow-sm"
                title={t('ai.feed.show')}
              >
                <PanelLeftOpen size={16} />
              </button>
              {criticalCount > 0 && (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center">
                    <Zap size={10} className="text-red-500" />
                  </div>
                  <span className="text-[9px] font-bold text-red-500">{criticalCount}</span>
                </div>
              )}
              <div className="flex-1" />
              <span className="text-[8px] text-slate-300 font-semibold [writing-mode:vertical-lr] rotate-180 tracking-wider uppercase">
                {t('ai.feed.label')}
              </span>
            </div>
          ) : (
            /* ── Expanded feed ── */
            <>
              <IntelligenceFeed
                reports={feedReports}
                onAskAbout={handleAskAboutReport}
                onExpandReport={setExpandedReport}
                onCollapse={toggleFeed}
              />
            </>
          )}
        </div>

        {/* ═══ RIGHT PANEL: AI Chat (expands when feed collapsed) ═══ */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white">

          {/* Chat Header — Recent Chats Dropdown */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setShowRecentChats(!showRecentChats)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <Bot size={16} style={{ color: colors.primary }} />
                  {t('ai.assistant')}
                  <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform ${showRecentChats ? 'rotate-180' : ''}`}
                  />
                </button>
                {/* Conversation memory indicator */}
                {turnCount > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-[9px] font-semibold text-green-600">
                    <History size={9} />
                    {turnCount} {turnCount === 1 ? t('ai.turns.singular') : t('ai.turns.plural')}
                  </span>
                )}
              </div>
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
              >
                <Plus size={12} />
                {t('ai.newChat')}
              </button>
            </div>

            {/* Collapsible Recent Chats */}
            <AnimatePresence>
              {showRecentChats && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                    {conversations.map((conv) => {
                      const msgCount = conv.messages.filter((m) => m.role === 'user').length;
                      const isActive = activeConvId === conv.id;
                      return (
                        <div
                          key={conv.id}
                          className={`group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-xs cursor-pointer ${
                            isActive ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50'
                          }`}
                          onClick={() => { setActiveConvId(conv.id); setShowRecentChats(false); setError(null); }}
                        >
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-slate-700 truncate block">{conv.title}</span>
                            <span className="text-[10px] text-slate-400">
                              {msgCount > 0 ? t('ai.msgs', { n: msgCount }) : t('ai.empty')}
                              {conv.createdAt ? ` · ${formatTimeAgo(conv.createdAt)}` : ''}
                            </span>
                          </div>
                          {/* Delete button — hidden unless hovered */}
                          {conversations.length > 1 && (
                            <button
                              onClick={(e) => handleDeleteConversation(conv.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                              title={t('ai.delete')}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chat Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
            {activeConv?.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                  <Bot size={24} style={{ color: colors.primary }} />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">{t('ai.empty.title')}</h3>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  {t('ai.empty.subtitle')}
                </p>

                {/* Dynamic Suggested Prompts */}
                <div className="w-full space-y-1.5">
                  {dynamicPrompts.slice(0, 6).map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      disabled={isStreaming}
                      className="block w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-all text-xs text-slate-600 disabled:opacity-50 truncate"
                    >
                      {prompt}
                    </button>
                  ))}
                  {IS_DEMO && [
                    lang === 'de'
                      ? 'Führe einen Materialschock von +5% auf die Warengruppe PW aus'
                      : 'Run a +5% material shock on commodity group PW',
                    lang === 'de'
                      ? 'Welche Kunden haben einen CLV > 1 Mio. € und eine Verbleiberate < 80%?'
                      : 'Which customers have CLV > €1M and retention < 80%?',
                    lang === 'de'
                      ? 'Zeige mir die Top 5 Artikel unterhalb der Preisuntergrenze'
                      : 'Show me the top 5 SKUs below their floor price',
                    lang === 'de'
                      ? 'Erkläre, warum die Gewinnquote in PW letzte Woche gefallen ist'
                      : 'Explain why win rate dropped in PW last week',
                    lang === 'de'
                      ? 'Was ist das Break-even-Volumen für PS-2241 bei aktuellen Kosten?'
                      : 'What is the break-even volume for PS-2241 at current cost?',
                    lang === 'de'
                      ? 'Zeige alle Anomalien der letzten 24 Stunden mit hoher Schwere'
                      : 'List all anomalies from the last 24 hours with severity high',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSend(prompt)}
                      disabled={isStreaming}
                      className="block w-full text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 transition-all text-xs text-slate-600 disabled:opacity-50 truncate"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeConv?.messages.map((msg, i) => (
              msg.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[88%] bg-blue-600 text-white px-3.5 py-2.5 rounded-2xl rounded-tr-none shadow-sm">
                    <p className="text-xs leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={12} style={{ color: colors.primary }} />
                  </div>
                  <div className="max-w-[88%] min-w-0">
                    {msg.content ? (
                      <>
                        {parseMessageContent(msg.content).map((part, j) => (
                          part.type === 'chart' ? (
                            <ChatChart key={j} spec={part.spec} />
                          ) : (
                            <div key={j} className="prose-chat text-xs">
                              {renderMarkdown(part.content)}
                            </div>
                          )
                        ))}
                        {/* Per-response feedback */}
                        {msg.content && !isStreaming && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <button
                              onClick={() => handleChatFeedback(i, 'up')}
                              className={`p-0.5 rounded transition-colors ${
                                chatFeedback[i] === 'up' ? 'text-green-600' : 'text-slate-300 hover:text-slate-400'
                              }`}
                            >
                              <ThumbsUp size={10} />
                            </button>
                            <button
                              onClick={() => handleChatFeedback(i, 'down')}
                              className={`p-0.5 rounded transition-colors ${
                                chatFeedback[i] === 'down' ? 'text-red-500' : 'text-slate-300 hover:text-slate-400'
                              }`}
                            >
                              <ThumbsDown size={10} />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      isStreaming && i === activeConv.messages.length - 1 && (
                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                          <Loader size={12} className="animate-spin" />
                          {t('ai.thinking')}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )
            ))}

            {/* Turn count nudge */}
            {showTurnNudge && !isStreaming && (
              <div className="flex justify-center">
                <div className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-full text-[10px] text-amber-700">
                  {t('ai.turnNudge')}{' '}
                  <button onClick={handleNewChat} className="font-bold underline">{t('ai.startFresh')}</button>{t('ai.startFreshSuffix')}
                </div>
              </div>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <div>
                  <p className="text-xs font-bold text-red-700">{t('ai.unavailable')}</p>
                  <p className="text-[10px] text-red-600 mt-0.5">{error}</p>
                  <div className="flex gap-2 mt-1.5">
                    {lastUserMsg && (
                      <button onClick={handleRetry} className="text-[10px] font-medium text-red-600 hover:text-red-800 flex items-center gap-1">
                        <RotateCcw size={10} /> {t('ai.retry')}
                      </button>
                    )}
                    <button onClick={() => setError(null)} className="text-[10px] text-red-500 hover:text-red-700 underline">
                      {t('ai.dismiss')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Strip: Contextual Follow-Up Suggestions */}
          {(followUpSuggestions.length > 0 || followUpsLoading) && !isStreaming && (
            <div className="flex-shrink-0 px-4 py-2 border-t border-slate-100 bg-slate-50/50">
              <div className="flex items-start gap-1.5">
                <MessageSquare size={10} className="text-blue-400 flex-shrink-0 mt-1" />
                <span className="text-[9px] text-slate-400 flex-shrink-0 mt-0.5">{t('ai.followUp')}</span>
                <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                  {followUpsLoading ? (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Loader size={10} className="animate-spin" />
                      {t('ai.generating')}
                    </span>
                  ) : (
                    followUpSuggestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(q)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[10px] text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left leading-snug"
                      >
                        {q}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-slate-200">
            {/* Suggested prompts for empty state (below chat area) */}
            {activeConv?.messages.length === 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {dynamicPrompts.slice(6, 8).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    disabled={isStreaming}
                    className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-600 transition-all text-[10px] font-medium text-slate-500 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
              <input
                className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-xs py-1.5 px-2.5 text-slate-800 min-w-0"
                placeholder={t('ai.placeholder')}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
              />
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="ml-1 w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                  title={t('ai.stop')}
                >
                  <Square size={12} />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="ml-1 w-8 h-8 text-white rounded-lg flex items-center justify-center transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: input.trim() ? colors.primary : '#94a3b8' }}
                >
                  <Send size={13} />
                </button>
              )}
            </div>
            <p className="text-[9px] text-center text-slate-300 mt-2">{t('ai.poweredBy')}</p>
          </div>
        </div>
      </div>

      {/* Report Detail Slide-Over */}
      <AnimatePresence>
        {expandedReport && (
          <InsightReportSlideOver
            report={expandedReport}
            onClose={() => setExpandedReport(null)}
            onAskAbout={handleAskAboutReport}
          />
        )}
      </AnimatePresence>
    </>
  );
}
