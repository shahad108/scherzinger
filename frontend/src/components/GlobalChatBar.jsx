import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Square, ChevronDown, ArrowUpRight, Loader, ThumbsUp, ThumbsDown, History, Plus, Trash2 } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useUI } from '../context/UIContext';
import { useLanguage } from '../context/LanguageContext';
import renderMarkdown from '../utils/markdownRenderer';
import StructuredReplyRenderer from './chat/StructuredReplyRenderer';
import { track, trackChatQuestion, trackChatRating } from '../utils/tracker';

export default function GlobalChatBar() {
  const {
    messages, isOpen, isStreaming,
    sendMessage, stopStreaming,
    setDetailedAnalysisHandoff, setIsOpen,
    pageContext, newChat,
    conversationHistory, loadConversation, deleteConversation,
  } = useChat();
  const { selectedItem, slideOver, openCustomerDetail, openSKUDetail } = useUI();

  const handleEntityClick = useCallback(({ entityType, id }) => {
    if (entityType === 'customer') openCustomerDetail(id);
    else if (entityType === 'sku' || entityType === 'product') openSKUDetail(id);
  }, [openCustomerDetail, openSKUDetail]);
  const { t, lang } = useLanguage();
  const [input, setInput] = useState('');
  const [ratings, setRatings] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // All hooks must be above any conditional return
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    setIsOpen(true);
    track.chatSend(text);
    trackChatQuestion({ pageContext: location.pathname, source: 'custom_typed', questionText: text });
    sendMessage(text);
  }, [input, isStreaming, setIsOpen, sendMessage, location.pathname]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleViewDetailed = useCallback((aiMsgIndex) => {
    // Find the user message that triggered this assistant reply.
    let triggeringUserIdx = aiMsgIndex - 1;
    while (triggeringUserIdx >= 0 && messages[triggeringUserIdx]?.role !== 'user') {
      triggeringUserIdx -= 1;
    }
    if (triggeringUserIdx < 0) return;
    const triggeringUserMsg = messages[triggeringUserIdx];
    const userQuestion = typeof triggeringUserMsg?.content === 'string' ? triggeringUserMsg.content.trim() : '';
    if (!userQuestion) return;

    // History = prior turns only. Exclude the triggering user question AND the
    // shallow assistant reply the user wants to improve on — otherwise the AI
    // sees the same question twice (once here, once as the new request) and
    // responds "you've already asked this."
    const threadMessages = messages
      .slice(0, triggeringUserIdx)
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => {
        if (msg.format === 'structured') {
          return { role: msg.role, content: JSON.stringify({ blocks: msg.blocks || [] }) };
        }
        return { role: msg.role, content: msg.content };
      })
      .filter((msg) => typeof msg.content === 'string' && msg.content.trim());

    track.chatViewDetailed();
    const handoffData = {
      id: globalThis.crypto?.randomUUID?.() ?? `handoff-${Date.now()}`,
      question: userQuestion,
      threadMessages,
      pageContext: pageContext || null,
      source: 'global-chat',
      createdAt: Date.now(),
    };
    setDetailedAnalysisHandoff(handoffData);
    setIsOpen(false);
    navigate(`/ai-insights?q=${encodeURIComponent(userQuestion)}`, {
      state: { detailedAnalysisHandoff: handoffData },
    });
  }, [messages, navigate, setDetailedAnalysisHandoff, setIsOpen, pageContext]);

  const handleCollapse = useCallback(() => {
    track.chatClose();
    setIsOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [setIsOpen]);

  // Hide on AI Insights page — after all hooks
  if (location.pathname === '/ai-insights') return null;

  return (
    <div
      className="fixed bottom-4 z-[60] flex justify-center pointer-events-none"
      style={{ left: 'var(--sidebar-width, 256px)', right: 0 }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
        className="pointer-events-auto flex flex-col overflow-hidden"
        style={{
          width: isOpen ? 'min(520px, calc(100% - 2rem))' : '400px',
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: isOpen
            ? '0 16px 48px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)'
            : '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        {/* Messages area — only visible when open */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="overflow-hidden"
            >
              {/* Header bar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100/80">
                <div className="flex items-center gap-2">
                  <Sparkles size={13} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-500 tracking-wide uppercase">{t('chat.brand')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { newChat(); track.event?.('chat_new'); }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-[#0393da] hover:bg-blue-50 transition-colors"
                    title={t('chat.newConvo')}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => setShowHistory(prev => !prev)}
                    className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${showHistory ? 'text-[#0393da] bg-blue-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                    title={t('chat.history')}
                  >
                    <History size={14} />
                  </button>
                  <button
                    onClick={handleCollapse}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    title={t('chat.minimize')}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              {/* Conversation history panel */}
              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b border-slate-100/80"
                  >
                    <div className="max-h-48 overflow-y-auto p-2 space-y-0.5">
                      {conversationHistory.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">{t('chat.noPast')}</p>
                      ) : conversationHistory.map(c => (
                        <div
                          key={c.id}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer group transition-colors"
                          onClick={() => { loadConversation(c.id); setShowHistory(false); }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{c.title || t('chat.untitled')}</p>
                            <p className="text-[10px] text-slate-400">{new Date(c.updated_at).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="overflow-y-auto px-4 py-3 space-y-3"
                style={{ maxHeight: '320px', minHeight: messages.length ? '120px' : '0px' }}
              >
                {messages.map((msg, i) =>
                  msg.role === 'user' ? (
                    <div key={i} className="flex flex-col items-end">
                      <div className="max-w-[80%] bg-slate-800 text-white px-3.5 py-2 rounded-2xl rounded-tr-md">
                        <p className="text-[13px] leading-relaxed">{msg.content}</p>
                      </div>
                      {msg.contextLabel && (
                        <p className="text-[9px] text-slate-400 mt-0.5 mr-1 flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-blue-300 inline-block" />
                          {msg.contextLabel}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[90%] min-w-0">
                        {msg.format === 'structured' ? (
                          ((msg.blocks && msg.blocks.length > 0) || msg.finalized) ? (
                            <>
                              <div className="bg-slate-50/80 px-3.5 py-2.5 rounded-2xl rounded-tl-md border border-slate-100/60">
                                <div className="text-[13px] leading-relaxed text-slate-700">
                                  <StructuredReplyRenderer
                                    blocks={msg.blocks || []}
                                    status={msg.status || []}
                                    finalized={!!msg.finalized}
                                    onEntityClick={handleEntityClick}
                                    onSuggestionClick={sendMessage}
                                    conversationMessages={messages}
                                    compact={true}
                                  />
                                </div>
                              </div>
                              {msg.finalized && !(isStreaming && i === messages.length - 1) && (
                                <div className="flex items-center gap-3 mt-1.5 ml-1">
                                  <button
                                    onClick={() => handleViewDetailed(i)}
                                    className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors group"
                                  >
                                    {t('chat.viewDetailed')}
                                    <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                  </button>
                                  <span className="text-slate-200">|</span>
                                  <button
                                    onClick={() => {
                                      if (ratings[i] === 'thumbs_up') return;
                                      setRatings(r => ({ ...r, [i]: 'thumbs_up' }));
                                      const userQ = [...messages].slice(0, i).reverse().find(m => m.role === 'user')?.content;
                                      trackChatRating(null, userQ || '', 'thumbs_up');
                                    }}
                                    className={`p-1 rounded transition-colors ${ratings[i] === 'thumbs_up' ? 'text-green-500 bg-green-50' : 'text-slate-300 hover:text-green-500 hover:bg-green-50'}`}
                                    title={t('chat.helpful')}
                                  >
                                    <ThumbsUp size={12} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (ratings[i] === 'thumbs_down') return;
                                      setRatings(r => ({ ...r, [i]: 'thumbs_down' }));
                                      const userQ = [...messages].slice(0, i).reverse().find(m => m.role === 'user')?.content;
                                      trackChatRating(null, userQ || '', 'thumbs_down');
                                    }}
                                    className={`p-1 rounded transition-colors ${ratings[i] === 'thumbs_down' ? 'text-red-500 bg-red-50' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                                    title={t('chat.notHelpful')}
                                  >
                                    <ThumbsDown size={12} />
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            isStreaming && i === messages.length - 1 && (
                              <div className="flex items-center gap-2 text-slate-400 text-xs px-1 py-2">
                                <Loader size={12} className="animate-spin" />
                                <span>{t('chat.thinking')}</span>
                              </div>
                            )
                          )
                        ) : msg.content ? (
                          <>
                            <div className="bg-slate-50/80 px-3.5 py-2.5 rounded-2xl rounded-tl-md border border-slate-100/60">
                              <div className="text-[13px] leading-relaxed text-slate-700 [&_strong]:text-slate-900 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-slate-700">
                                {renderMarkdown(msg.content)}
                              </div>
                            </div>
                            {!(isStreaming && i === messages.length - 1) && (
                              <div className="flex items-center gap-3 mt-1.5 ml-1">
                                <button
                                  onClick={() => handleViewDetailed(i)}
                                  className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors group"
                                >
                                  {t('chat.viewDetailed')}
                                  <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                </button>
                                <span className="text-slate-200">|</span>
                                <button
                                  onClick={() => {
                                    if (ratings[i] === 'thumbs_up') return;
                                    setRatings(r => ({ ...r, [i]: 'thumbs_up' }));
                                    const userQ = [...messages].slice(0, i).reverse().find(m => m.role === 'user')?.content;
                                    trackChatRating(null, userQ || '', 'thumbs_up');
                                  }}
                                  className={`p-1 rounded transition-colors ${ratings[i] === 'thumbs_up' ? 'text-green-500 bg-green-50' : 'text-slate-300 hover:text-green-500 hover:bg-green-50'}`}
                                  title={t('chat.helpful')}
                                >
                                  <ThumbsUp size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (ratings[i] === 'thumbs_down') return;
                                    setRatings(r => ({ ...r, [i]: 'thumbs_down' }));
                                    const userQ = [...messages].slice(0, i).reverse().find(m => m.role === 'user')?.content;
                                    trackChatRating(null, userQ || '', 'thumbs_down');
                                  }}
                                  className={`p-1 rounded transition-colors ${ratings[i] === 'thumbs_down' ? 'text-red-500 bg-red-50' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                                  title={t('chat.notHelpful')}
                                >
                                  <ThumbsDown size={12} />
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          isStreaming && i === messages.length - 1 && (
                            <div className="flex items-center gap-2 text-slate-400 text-xs px-1 py-2">
                              <Loader size={12} className="animate-spin" />
                              <span>{t('chat.thinking')}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Context indicator */}
        {(selectedItem || slideOver?.type) && (
          <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-slate-400 truncate" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
            <span className="truncate">
              {slideOver?.type === 'sku' ? t('chat.viewSku', { id: slideOver.id }) :
               slideOver?.type === 'category' ? t('chat.viewCategory', { id: slideOver.id }) :
               slideOver?.type === 'customer' ? t('chat.viewCustomer', { id: slideOver.id }) :
               selectedItem ? t('chat.selected', { label: selectedItem.label || selectedItem.id }) : ''}
            </span>
          </div>
        )}

        {/* Input area — always visible */}
        <div className={`flex items-end gap-2 px-3 py-2.5 ${isOpen ? 'border-t border-slate-100/80' : ''}`}>
          {!isOpen && messages.length > 0 ? (
            <button
              onClick={() => { track.chatOpen(); setIsOpen(true); }}
              className="flex-shrink-0 mb-1 w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              title={t('chat.showConvo')}
            >
              <ChevronDown size={14} className="rotate-180" />
            </button>
          ) : !isOpen ? (
            <Sparkles size={14} className="text-slate-300 flex-shrink-0 mb-2" />
          ) : null}
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none bg-transparent text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none py-1.5 leading-relaxed"
            placeholder={t('chat.placeholder')}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ maxHeight: '150px' }}
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="w-7 h-7 flex-shrink-0 bg-slate-800 text-white rounded-lg flex items-center justify-center hover:bg-slate-700 transition-colors mb-0.5"
            >
              <Square size={10} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-7 h-7 flex-shrink-0 bg-slate-800 text-white rounded-lg flex items-center justify-center hover:bg-slate-700 transition-colors disabled:opacity-20 disabled:cursor-not-allowed mb-0.5"
            >
              <Send size={12} />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
