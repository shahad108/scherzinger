-- ============================================
-- PRYZM Scherzinger — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================

-- 1. Chat Conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  title TEXT,
  page_context TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_conversations_username ON chat_conversations(username);
CREATE INDEX idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

-- 2. Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  context_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);

-- 3. Login Sessions
CREATE TABLE IF NOT EXISTS login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  login_at TIMESTAMPTZ DEFAULT now(),
  logout_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  user_agent TEXT,
  ip_address TEXT,
  session_data JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_login_sessions_username ON login_sessions(username);
CREATE INDEX idx_login_sessions_login ON login_sessions(login_at DESC);

-- 4. User Activity / Page Views
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  session_id UUID REFERENCES login_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  page TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_activity_username ON user_activity(username, created_at DESC);
CREATE INDEX idx_user_activity_event ON user_activity(event_type);

-- 5. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_conversations_updated
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 6. Enable Row Level Security (public access for now — single-tenant app)
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- Allow all operations via anon key (single-tenant, no Supabase Auth)
CREATE POLICY "Allow all on chat_conversations" ON chat_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on chat_messages" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on login_sessions" ON login_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_activity" ON user_activity FOR ALL USING (true) WITH CHECK (true);
