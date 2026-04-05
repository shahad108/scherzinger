import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { streamChat } from '../utils/openrouter';
import { SYSTEM_PROMPT_MINI } from '../utils/systemPromptMini';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [detailedAnalysisHandoff, setDetailedAnalysisHandoff] = useState(null);
  const [pageContext, setPageContext] = useState(null);
  const [pageContextLabel, setPageContextLabel] = useState(null);
  const abortRef = useRef(null);
  const messagesRef = useRef(messages);
  const pageContextRef = useRef(pageContext);
  const pageContextLabelRef = useRef(pageContextLabel);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { pageContextRef.current = pageContext; }, [pageContext]);
  useEffect(() => { pageContextLabelRef.current = pageContextLabel; }, [pageContextLabel]);

  const newChat = useCallback(() => { setMessages([]); }, []);
  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);
  const clearDetailedAnalysisHandoff = useCallback(() => setDetailedAnalysisHandoff(null), []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(async (text) => {
    const msg = text.trim();
    if (!msg) return;

    const userMsg = { role: 'user', content: msg, contextLabel: pageContextLabelRef.current || null };
    const assistantMsg = { role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const history = [...messagesRef.current, userMsg]
      .filter(m => m.content && m.content.trim())
      .map(m => ({ role: m.role, content: m.content }));
    const currentContext = pageContextRef.current;
    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT_MINI },
      ...(currentContext ? [{ role: 'system', content: currentContext }] : []),
      ...history,
    ];

    await streamChat(apiMessages, {
      onChunk(chunk) {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return updated;
        });
      },
      onDone() {
        setIsStreaming(false);
        abortRef.current = null;
      },
      onError(err) {
        setIsStreaming(false);
        abortRef.current = null;
        if (err.name === 'AbortError') return;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content || '_Something went wrong. Please try again._',
          };
          return updated;
        });
      },
      signal: controller.signal,
    });
  }, []);

  return (
    <ChatContext.Provider value={{
      messages, isOpen, isStreaming, detailedAnalysisHandoff,
      toggleOpen, sendMessage, stopStreaming,
      setDetailedAnalysisHandoff, clearDetailedAnalysisHandoff,
      setIsOpen, newChat, pageContext, setPageContext, setPageContextLabel,
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
