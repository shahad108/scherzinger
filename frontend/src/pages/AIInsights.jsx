import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Send, Paperclip, Bot, Plus, Loader, Square, RotateCcw } from 'lucide-react';
import Header from '../components/Header';
import ChatChart from '../components/ChatChart';
import { useChat } from '../context/ChatContext';
import { streamChat } from '../utils/openrouter';
import { SYSTEM_PROMPT } from '../utils/systemPrompt';
import renderMarkdown from '../utils/markdownRenderer';

// API key is now on server — always available to authenticated users

const DETAIL_ANALYSIS_INSTRUCTION = `
The user opened the dedicated AI Insights screen from "View Detailed Analysis".

Use any prior mini-chat messages only as hidden context. Do not mention the handoff mechanics.
Provide a deeper, decision-ready answer to the user's latest question.
When the question involves comparison, trend, distribution, ranking, forecast, or performance, include exactly one valid \`\`\`chart block.
End with a numbered list of concrete recommended actions tailored to Scherzinger.
`;

const suggestions = [
  "What is our overall margin performance?",
  "Which commodity groups have the highest margins?",
  "Show me the quote win rate trend",
  "Which customers are at highest risk?",
  "What's driving the margin decline?",
  "Total margin recovery potential by action",
  "Cost inflation analysis by commodity",
  "Full FY26 forecast with confidence intervals",
];

function createConversationId() {
  return globalThis.crypto?.randomUUID?.() ?? `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createConversation(overrides = {}) {
  return {
    id: createConversationId(),
    title: 'New Chat',
    messages: [],
    ...overrides,
  };
}

function buildConversationTitle(text) {
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

function sanitizeHistoryMessages(messages = []) {
  return messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
      && message.content.trim()
    ))
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
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

export default function AIInsights() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { detailedAnalysisHandoff, clearDetailedAnalysisHandoff, pageContext } = useChat();
  const initialConversationRef = useRef(null);
  if (!initialConversationRef.current) {
    initialConversationRef.current = createConversation();
  }
  const [conversations, setConversations] = useState([initialConversationRef.current]);
  const [activeConvId, setActiveConvId] = useState(initialConversationRef.current.id);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [lastUserMsg, setLastUserMsg] = useState(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const conversationsRef = useRef(conversations);
  const activeConvIdRef = useRef(activeConvId);
  const isStreamingRef = useRef(isStreaming);
  const processedEntryIdsRef = useRef(new Set());
  const lastRequestRef = useRef(null);

  // No persistence — conversations are in-memory only

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const activeConv = conversations.find((conversation) => conversation.id === activeConvId) || conversations[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConv?.messages]);

  const sendToConversation = useCallback(async (rawText, options = {}) => {
    const msg = (rawText ?? '').trim();
    if (!msg || isStreamingRef.current) return false;

    const conversationId = options.conversationId ?? activeConvIdRef.current;
    const currentConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const priorVisibleMessages = options.visibleMessages ?? currentConversation?.messages ?? [];
    const historyMessages = sanitizeHistoryMessages(options.historyMessages ?? priorVisibleMessages);
    const nextTitle = options.title
      ?? (priorVisibleMessages.some((message) => message.role === 'user')
        ? currentConversation?.title || 'New Chat'
        : buildConversationTitle(msg));

    const userMessage = { role: 'user', content: msg };
    const assistantPlaceholder = { role: 'assistant', content: '' };

    setInput('');
    setError(null);
    setLastUserMsg(msg);
    setActiveConvId(conversationId);
    setIsStreaming(true);
    isStreamingRef.current = true;


    lastRequestRef.current = {
      msg,
      conversationId,
      visibleMessages: priorVisibleMessages,
      historyMessages,
      additionalInstructions: options.additionalInstructions,
      title: nextTitle,
    };

    setConversations((prev) => {
      const nextConversation = {
        ...(prev.find((conversation) => conversation.id === conversationId) || createConversation({ id: conversationId })),
        id: conversationId,
        title: nextTitle,
        messages: [...priorVisibleMessages, userMessage, assistantPlaceholder],
      };

      const existingIndex = prev.findIndex((conversation) => conversation.id === conversationId);
      if (existingIndex === -1) {
        return [nextConversation, ...prev];
      }

      const updated = [...prev];
      updated[existingIndex] = nextConversation;
      return updated;
    });

    const controller = new AbortController();
    abortRef.current = controller;

    const effectiveContext = options.handoffPageContext || pageContext;
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMessages,
      ...(effectiveContext ? [{ role: 'system', content: effectiveContext }] : []),
      ...(options.additionalInstructions ? [{ role: 'system', content: options.additionalInstructions }] : []),
      userMessage,
    ];

    let fullResponse = '';

    await streamChat(apiMessages, {
      onChunk(chunk) {
        fullResponse += chunk;
        setConversations((prev) => prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const nextMessages = [...conversation.messages];
          const lastMessage = nextMessages[nextMessages.length - 1];
          if (!lastMessage || lastMessage.role !== 'assistant') return conversation;
          nextMessages[nextMessages.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + chunk,
          };
          return { ...conversation, messages: nextMessages };
        }));
      },
      onDone() {
        setIsStreaming(false);
        isStreamingRef.current = false;
        abortRef.current = null;

      },
      onError(err) {
        setIsStreaming(false);
        isStreamingRef.current = false;
        abortRef.current = null;

        if (err.name === 'AbortError') return;

        setError(err.message || 'Something went wrong. Please try again.');
        setConversations((prev) => prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const nextMessages = [...conversation.messages];
          const lastMessage = nextMessages[nextMessages.length - 1];
          if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content) return conversation;
          nextMessages[nextMessages.length - 1] = {
            ...lastMessage,
            content: '_Unable to generate a response right now. Use Retry to try again._',
          };
          return { ...conversation, messages: nextMessages };
        }));
      },
      signal: controller.signal,
    });

    return true;
  }, []);

  const startDetailedAnalysis = useCallback((question, threadMessages = [], handoffContext = null) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    const conversationId = createConversationId();
    setActiveConvId(conversationId);

    sendToConversation(trimmedQuestion, {
      conversationId,
      visibleMessages: [],
      historyMessages: threadMessages,
      additionalInstructions: DETAIL_ANALYSIS_INSTRUCTION,
      handoffPageContext: handoffContext,
      title: buildConversationTitle(trimmedQuestion),
    });
  }, [sendToConversation]);

  useEffect(() => {
    const locationHandoff = location.state?.detailedAnalysisHandoff;
    const handoff = detailedAnalysisHandoff?.id ? detailedAnalysisHandoff : locationHandoff;

    if (handoff?.id) {
      if (processedEntryIdsRef.current.has(handoff.id)) return;

      processedEntryIdsRef.current.add(handoff.id);
      if (detailedAnalysisHandoff?.id === handoff.id) {
        clearDetailedAnalysisHandoff();
      }

      const threadMessages = sanitizeHistoryMessages(handoff.threadMessages);
      startDetailedAnalysis(handoff.question || '', threadMessages, handoff.pageContext || null);
      return;
    }

    const queryQuestion = searchParams.get('q')?.trim();
    if (!queryQuestion) return;

    const queryKey = `query:${queryQuestion}`;
    if (processedEntryIdsRef.current.has(queryKey)) return;

    processedEntryIdsRef.current.add(queryKey);
    startDetailedAnalysis(queryQuestion, []);
  }, [clearDetailedAnalysisHandoff, detailedAnalysisHandoff, location.state, searchParams, startDetailedAnalysis]);

  const handleNewChat = useCallback(() => {
    const newConversation = createConversation();
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConvId(newConversation.id);
    setInput('');
    setError(null);
  }, []);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    isStreamingRef.current = false;
  }, []);

  const handleSend = useCallback((text) => {
    const nextText = (text ?? input).trim();
    if (!nextText) return;
    sendToConversation(nextText);
  }, [input, sendToConversation]);

  const handleRetry = useCallback(() => {
    const lastRequest = lastRequestRef.current;
    if (!lastRequest || isStreamingRef.current) return;

    setError(null);
    setActiveConvId(lastRequest.conversationId);
    setConversations((prev) => prev.map((conversation) => (
      conversation.id === lastRequest.conversationId
        ? { ...conversation, title: lastRequest.title, messages: [...lastRequest.visibleMessages] }
        : conversation
    )));

    sendToConversation(lastRequest.msg, lastRequest);
  }, [sendToConversation]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      <Header title="AI Insights" />
      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="w-72 min-h-0 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-4">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-100 transition-colors shadow-sm active:scale-[0.97]"
            >
              <Plus size={14} />
              New Chat
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recent</div>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => { setActiveConvId(conversation.id); setError(null); }}
                className={`block w-full text-left px-3 py-3 rounded-lg transition-colors hover:-translate-y-0.5 ${
                  activeConvId === conversation.id ? 'bg-[#0393da]/5 border border-[#0393da]/10' : 'hover:bg-slate-100'
                }`}
              >
                <p className="text-sm font-medium text-slate-800 truncate">{conversation.title}</p>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {conversation.messages.length ? `${conversation.messages.length} messages` : 'Empty'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-8 space-y-6 max-w-[1440px] mx-auto w-full">
            {activeConv?.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#0393da]/10 flex items-center justify-center text-[#0393da] mb-4">
                  <Bot size={28} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">PRYZM AI Assistant</h3>
                <p className="text-sm text-slate-500 max-w-md">
                  Ask about pricing intelligence, margin recovery opportunities, SKU-level recommendations, inventory alerts, forecasting, or action plans. I can analyze data and create charts.
                </p>
              </div>
            )}

            {activeConv?.messages.map((msg, i) => (
              msg.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] bg-[#0393da] text-white p-4 rounded-2xl rounded-tr-none shadow-sm">
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-[#0393da]/20 flex items-center justify-center text-[#0393da] flex-shrink-0 mt-1">
                    <Bot size={16} />
                  </div>
                  <div className="max-w-[85%] min-w-0">
                    {msg.content ? (
                      parseMessageContent(msg.content).map((part, j) => (
                        part.type === 'chart' ? (
                          <ChatChart key={j} spec={part.spec} />
                        ) : (
                          <div key={j} className="prose-chat">
                            {renderMarkdown(part.content)}
                          </div>
                        )
                      ))
                    ) : (
                      isStreaming && i === activeConv.messages.length - 1 && (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <Loader size={14} className="animate-spin" />
                          Thinking...
                        </div>
                      )
                    )}
                  </div>
                </div>
              )
            ))}
          </div>

          {error && (
            <div className="mx-6 mb-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="size-8 bg-red-100 rounded-lg flex items-center justify-center text-red-500 flex-shrink-0">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-red-700">AI Assistant Unavailable</p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                  <div className="flex gap-3 mt-2">
                    {lastUserMsg && (
                      <button
                        onClick={handleRetry}
                        className="text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1"
                      >
                        <RotateCcw size={12} /> Retry
                      </button>
                    )}
                    <button
                      onClick={() => { setError(null); }}
                      className="text-xs font-medium text-red-500 hover:text-red-700 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="p-6 bg-white border-t border-slate-200">
            {activeConv?.messages.length === 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    disabled={isStreaming}
                    className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-[#0393da]/10 hover:text-[#0393da] transition-all active:scale-[0.97] text-xs font-medium border border-transparent hover:border-[#0393da]/20 text-slate-600 disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <div className="flex items-center bg-white border border-slate-200 rounded-xl p-2 shadow-lg">
                <button className="p-2 text-slate-400 hover:text-[#0393da] transition-colors">
                  <Paperclip size={18} />
                </button>
                <input
                  className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm py-2 px-3 text-slate-800 min-w-0"
                  placeholder="Ask about your data..."
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                />
                {isStreaming ? (
                  <button
                    onClick={handleStop}
                    className="ml-2 w-10 h-10 bg-red-500 text-white rounded-lg flex items-center justify-center hover:bg-red-600 transition-colors shadow-md active:scale-[0.97]"
                    title="Stop generating"
                  >
                    <Square size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="ml-2 w-10 h-10 bg-[#0393da] text-white rounded-lg flex items-center justify-center hover:bg-[#0280bd] transition-colors shadow-md active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-center text-slate-400 mt-3">PRYZM AI powered by Claude</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
