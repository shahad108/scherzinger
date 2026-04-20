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

// ─── Measures ───
// Remote persistence for the action-tracking framework. Rows are mirrored
// from/to the useMeasures hook's localStorage so offline still works.

function toRow(m) {
  return {
    id: m.id,
    title: m.title,
    description: m.description ?? '',
    source_kpi: m.sourceKpi ?? null,
    source_dashboard: m.sourceDashboard ?? null,
    source_element_id: m.sourceElementId ?? null,
    owner: m.owner ?? null,
    due_date: m.dueDate ?? null,
    status: m.status ?? 'open',
    username: m.username ?? null,
    created_at: m.createdAt ?? undefined,
    updated_at: m.updatedAt ?? undefined,
  };
}

function fromRow(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    sourceKpi: r.source_kpi ?? null,
    sourceDashboard: r.source_dashboard ?? null,
    sourceElementId: r.source_element_id ?? null,
    owner: r.owner ?? null,
    dueDate: r.due_date ?? null,
    status: r.status ?? 'open',
    username: r.username ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    history: [],
  };
}

// Returns { ok:true, data } on success; { ok:false, missing:true } when the
// measures table isn't yet provisioned. Callers fall back to localStorage.
async function safeMeasuresCall(fn) {
  try {
    const r = await fn();
    if (r.error) {
      const code = r.error.code || '';
      // 42P01 = undefined_table; PGRST205 = schema cache miss
      if (code === '42P01' || String(r.error.message || '').includes('does not exist') || String(r.error.message || '').includes('schema cache')) {
        return { ok: false, missing: true, error: r.error };
      }
      console.warn('[measures] supabase error:', r.error);
      return { ok: false, missing: false, error: r.error };
    }
    return { ok: true, data: r.data };
  } catch (e) {
    console.warn('[measures] supabase exception:', e);
    return { ok: false, missing: false, error: e };
  }
}

export async function listMeasuresRemote() {
  const r = await safeMeasuresCall(() =>
    supabase.from('measures').select('*').order('created_at', { ascending: false })
  );
  if (!r.ok) return { ok: false, missing: !!r.missing, data: [] };
  return { ok: true, missing: false, data: (r.data || []).map(fromRow) };
}

export async function upsertMeasureRemote(measure) {
  return safeMeasuresCall(() =>
    supabase.from('measures').upsert(toRow(measure), { onConflict: 'id' }).select().single()
  );
}

export async function deleteMeasureRemote(id) {
  return safeMeasuresCall(() =>
    supabase.from('measures').delete().eq('id', id)
  );
}

export async function appendMeasureHistoryRemote(measureId, entry) {
  return safeMeasuresCall(() =>
    supabase.from('measure_history').insert({
      measure_id: measureId,
      author: entry.author ?? null,
      note: entry.note ?? null,
      status_from: entry.statusFrom ?? null,
      status_to: entry.statusTo ?? null,
      ts: entry.ts ?? new Date().toISOString(),
    })
  );
}

// ─── KPI snapshots ───

export async function recordKpiSnapshot(snapshot) {
  return safeMeasuresCall(() =>
    supabase.from('kpi_snapshots').insert({
      dashboard: snapshot.dashboard,
      element_id: snapshot.elementId ?? null,
      kpi_name: snapshot.kpiName,
      value: snapshot.value ?? null,
      target: snapshot.target ?? null,
      comparator: snapshot.comparator ?? null,
      tolerance: snapshot.tolerance ?? null,
      in_tolerance: snapshot.inTolerance ?? null,
      metadata: snapshot.metadata ?? {},
      username: snapshot.username ?? null,
    })
  );
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
