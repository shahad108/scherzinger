import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { streamChat } from '../utils/openrouter';
import { SYSTEM_PROMPT_MINI } from '../utils/systemPromptMini';
import { getSession } from '../utils/auth';
import { useLanguage } from './LanguageContext';
import { translations } from '../i18n/translations';
import {
  createConversation,
  getConversations,
  getConversationMessages,
  saveMessage,
  updateMessage,
  updateConversationTitle,
  deleteConversation as deleteConversationDb,
} from '../utils/supabaseService';
import { createStreamParser } from '../utils/structuredReply/streamParser';
import { STRUCTURED_RESPONSE_PROMPT } from '../utils/structuredReply/prompt';

export const STRUCTURED_CHAT = true; // feature flag

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { lang } = useLanguage();
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const [messages, setMessages] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [detailedAnalysisHandoff, setDetailedAnalysisHandoff] = useState(null);
  const [pageContext, setPageContext] = useState(null);
  const [pageContextLabel, setPageContextLabel] = useState(null);

  // Supabase conversation state
  const [conversationId, setConversationId] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const abortRef = useRef(null);
  const messagesRef = useRef(messages);
  const pageContextRef = useRef(pageContext);
  const pageContextLabelRef = useRef(pageContextLabel);
  const assistantMsgIdRef = useRef(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pageContextRef.current = pageContext; }, [pageContext]);
  useEffect(() => { pageContextLabelRef.current = pageContextLabel; }, [pageContextLabel]);

  // Load conversation history on mount
  useEffect(() => {
    const session = getSession();
    if (!session) return;
    getConversations(session.username, 30).then(convos => {
      setConversationHistory(convos);
      setHistoryLoaded(true);
    }).catch(() => setHistoryLoaded(true));
  }, []);

  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);
  const clearDetailedAnalysisHandoff = useCallback(() => setDetailedAnalysisHandoff(null), []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // Load a past conversation
  const loadConversation = useCallback(async (convoId) => {
    const msgs = await getConversationMessages(convoId);
    setConversationId(convoId);
    setMessages(msgs.map(m => {
      if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed && Array.isArray(parsed.blocks)) {
            return {
              role: 'assistant',
              format: 'structured',
              blocks: parsed.blocks,
              status: parsed.blocks.map(() => 'ready'),
              finalized: true,
              raw: m.content,
              contextLabel: m.context_label,
              dbId: m.id,
            };
          }
        } catch { /* fall through */ }
      }
      return {
        role: m.role,
        format: 'markdown',
        content: m.content,
        contextLabel: m.context_label,
        dbId: m.id,
      };
    }));
    setIsOpen(true);
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (convoId) => {
    await deleteConversationDb(convoId);
    setConversationHistory(prev => prev.filter(c => c.id !== convoId));
    if (conversationId === convoId) {
      setMessages([]);
      setConversationId(null);
    }
  }, [conversationId]);

  const sendMessage = useCallback(async (text) => {
    const msg = text.trim();
    if (!msg) return;

    const session = getSession();
    const username = session?.username || 'anonymous';
    const contextLabel = pageContextLabelRef.current || null;

    let activeConvoId = conversationId;
    if (!activeConvoId) {
      const convo = await createConversation(
        username,
        msg.slice(0, 80),
        pageContextRef.current?.slice(0, 200)
      );
      if (convo) {
        activeConvoId = convo.id;
        setConversationId(convo.id);
        setConversationHistory(prev => [convo, ...prev]);
      }
    }

    const userMsg = { role: 'user', content: msg, contextLabel };
    const assistantMsg = STRUCTURED_CHAT
      ? { role: 'assistant', format: 'structured', blocks: [], status: [], finalized: false, raw: '' }
      : { role: 'assistant', format: 'markdown', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    if (activeConvoId) {
      saveMessage(activeConvoId, 'user', msg, contextLabel).catch(() => {});
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const history = [...messagesRef.current, userMsg]
      .filter(m => (m.content && m.content.trim()) || m.format === 'structured')
      .map(m => {
        if (m.format === 'structured') {
          return { role: m.role, content: JSON.stringify({ blocks: m.blocks }) };
        }
        return { role: m.role, content: m.content };
      });

    const currentContext = pageContextRef.current;
    const currentLang = langRef.current;
    const langDirective = currentLang === 'de' ? translations.de['ai.directive.de'] : null;
    const systemPrompt = STRUCTURED_CHAT
      ? `${SYSTEM_PROMPT_MINI}\n\n${STRUCTURED_RESPONSE_PROMPT}`
      : SYSTEM_PROMPT_MINI;
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...(langDirective ? [{ role: 'system', content: langDirective }] : []),
      ...(currentContext ? [{ role: 'system', content: currentContext }] : []),
      ...history,
    ];

    let fullResponse = '';
    const parser = STRUCTURED_CHAT ? createStreamParser() : null;

    await streamChat(apiMessages, {
      onChunk(chunk) {
        fullResponse += chunk;
        if (STRUCTURED_CHAT) {
          const r = parser.feed(chunk);
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = {
              ...last,
              blocks: r.blocks,
              status: r.status,
              raw: fullResponse,
            };
            return updated;
          });
        } else {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
            return updated;
          });
        }
      },
      onDone() {
        setIsStreaming(false);
        abortRef.current = null;
        if (STRUCTURED_CHAT) {
          const r = parser.finalize();
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (r.ok) {
              updated[updated.length - 1] = {
                ...last,
                blocks: r.blocks,
                status: r.status,
                finalized: true,
                raw: r.raw,
              };
            } else {
              updated[updated.length - 1] = {
                role: 'assistant',
                format: 'markdown',
                content: r.raw || fullResponse,
                fallback: true,
              };
            }
            return updated;
          });
        }
        if (activeConvoId && fullResponse) {
          saveMessage(activeConvoId, 'assistant', fullResponse).catch(() => {});
        }
      },
      onError(err) {
        setIsStreaming(false);
        abortRef.current = null;
        if (err.name === 'AbortError') return;
        const errorText = fullResponse || '_Something went wrong. Please try again._';
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant', format: 'markdown', content: errorText, fallback: true,
          };
          return updated;
        });
        if (activeConvoId && errorText) {
          saveMessage(activeConvoId, 'assistant', errorText).catch(() => {});
        }
      },
      signal: controller.signal,
    });
  }, [conversationId]);

  return (
    <ChatContext.Provider value={{
      messages, isOpen, isStreaming, detailedAnalysisHandoff,
      toggleOpen, sendMessage, stopStreaming,
      setDetailedAnalysisHandoff, clearDetailedAnalysisHandoff,
      setIsOpen, newChat, pageContext, setPageContext, setPageContextLabel,
      // Supabase conversation features
      conversationId,
      conversationHistory,
      historyLoaded,
      loadConversation,
      deleteConversation,
      structuredMode: STRUCTURED_CHAT,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
