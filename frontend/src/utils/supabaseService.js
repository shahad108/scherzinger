import { supabase } from './supabase';

// ─── Chat Conversations ───

export async function createConversation(username, title, pageContext) {
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ username, title, page_context: pageContext })
    .select()
    .single();
  if (error) console.error('createConversation error:', error);
  return data;
}

export async function getConversations(username, limit = 20) {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, title, page_context, created_at, updated_at')
    .eq('username', username)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) console.error('getConversations error:', error);
  return data || [];
}

export async function getConversationMessages(conversationId) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, context_label, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) console.error('getConversationMessages error:', error);
  return data || [];
}

export async function updateConversationTitle(conversationId, title) {
  const { error } = await supabase
    .from('chat_conversations')
    .update({ title })
    .eq('id', conversationId);
  if (error) console.error('updateConversationTitle error:', error);
}

export async function deleteConversation(conversationId) {
  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', conversationId);
  if (error) console.error('deleteConversation error:', error);
}

// ─── Chat Messages ───

export async function saveMessage(conversationId, role, content, contextLabel) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, role, content, context_label: contextLabel })
    .select()
    .single();
  if (error) console.error('saveMessage error:', error);
  // Touch the conversation's updated_at
  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  return data;
}

export async function updateMessage(messageId, content) {
  const { error } = await supabase
    .from('chat_messages')
    .update({ content })
    .eq('id', messageId);
  if (error) console.error('updateMessage error:', error);
}

// ─── Login Sessions ───

export async function createLoginSession(username) {
  const { data, error } = await supabase
    .from('login_sessions')
    .insert({
      username,
      user_agent: navigator.userAgent,
      session_data: {
        screen: `${screen.width}x${screen.height}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    })
    .select()
    .single();
  if (error) console.error('createLoginSession error:', error);
  return data;
}

export async function endLoginSession(sessionId) {
  // Get login_at to calculate duration
  const { data: session } = await supabase
    .from('login_sessions')
    .select('login_at')
    .eq('id', sessionId)
    .single();

  const duration = session
    ? Math.round((Date.now() - new Date(session.login_at).getTime()) / 1000)
    : null;

  const { error } = await supabase
    .from('login_sessions')
    .update({ logout_at: new Date().toISOString(), duration_seconds: duration })
    .eq('id', sessionId);
  if (error) console.error('endLoginSession error:', error);
}

export async function getLoginHistory(username, limit = 20) {
  const { data, error } = await supabase
    .from('login_sessions')
    .select('*')
    .eq('username', username)
    .order('login_at', { ascending: false })
    .limit(limit);
  if (error) console.error('getLoginHistory error:', error);
  return data || [];
}

// ─── User Activity ───

export async function trackActivity(username, eventType, page, metadata = {}) {
  const sessionId = getActiveSessionId();
  const { error } = await supabase
    .from('user_activity')
    .insert({
      username,
      session_id: sessionId,
      event_type: eventType,
      page,
      metadata,
    });
  if (error) console.error('trackActivity error:', error);
}

// ─── Session ID helper (stored in sessionStorage) ───

const SESSION_ID_KEY = 'pryzm_supabase_session_id';

export function setActiveSessionId(id) {
  sessionStorage.setItem(SESSION_ID_KEY, id);
}

export function getActiveSessionId() {
  return sessionStorage.getItem(SESSION_ID_KEY) || null;
}

export function clearActiveSessionId() {
  sessionStorage.removeItem(SESSION_ID_KEY);
}
