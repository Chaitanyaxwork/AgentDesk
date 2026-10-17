-- ==============================================================================
-- AgentDesk Database Schema
-- Supabase PostgreSQL + pgvector Schema
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ==============================================================================
-- 2. Businesses Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  website TEXT,
  logo_url TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  widget_config JSONB NOT NULL DEFAULT '{
    "primary_color": "#2563eb",
    "text_color": "#ffffff",
    "welcome_message": "Hello! How can I help you today?",
    "bot_name": "Support Bot",
    "bot_avatar_url": null,
    "position": "bottom-right",
    "show_branding": true,
    "auto_open_delay_ms": null,
    "placeholder_text": "Type a message...",
    "offline_message": "We are currently offline. Please leave your email and we will get back to you!"
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. Sources Table (Knowledge base sources: websites, uploaded text, pdfs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('website', 'pdf', 'text')),
  url TEXT,
  title TEXT NOT NULL,
  content_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  chunks_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_scraped_at TIMESTAMPTZ
);

-- ==============================================================================
-- 4. Chunks Table (Vector embeddings for RAG)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(768), -- Gemini text-embedding-004 produces 768 dimensions
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 5. Conversations Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_location TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),
  satisfaction_score INT CHECK (satisfaction_score BETWEEN 1 AND 5),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. Messages Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. Team Members Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 8. Indexes
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_business_id ON sources(business_id);
CREATE INDEX IF NOT EXISTS idx_chunks_business_id ON chunks(business_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source_id ON chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conversations_visitor_id ON conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_team_members_business_id ON team_members(business_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- HNSW Vector Index for fast approximate cosine nearest neighbors search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
ON chunks
USING hnsw (embedding vector_cosine_ops);

-- ==============================================================================
-- 9. Automatic Updated At Timestamp Trigger
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_businesses_updated_at ON businesses;
CREATE TRIGGER trigger_update_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_conversations_updated_at ON conversations;
CREATE TRIGGER trigger_update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 10. Vector Similarity Search Function (match_chunks)
-- ==============================================================================
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(768),
  match_business_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  source_id UUID,
  business_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.source_id,
    c.business_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
  FROM chunks c
  WHERE c.business_id = match_business_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- ==============================================================================
-- 11. Row Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current authenticated user owns or is a member of business
CREATE OR REPLACE FUNCTION auth_user_has_business_access(b_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses WHERE id = b_id AND user_id = auth.uid()
    UNION
    SELECT 1 FROM team_members WHERE business_id = b_id AND user_id = auth.uid()
  );
$$;

-- Businesses Policies
CREATE POLICY "Users can view their own businesses"
  ON businesses FOR SELECT
  USING (user_id = auth.uid() OR auth_user_has_business_access(id));

CREATE POLICY "Users can create their own business"
  ON businesses FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own business"
  ON businesses FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own business"
  ON businesses FOR DELETE
  USING (user_id = auth.uid());

-- Sources Policies
CREATE POLICY "Users can view their business sources"
  ON sources FOR SELECT
  USING (auth_user_has_business_access(business_id));

CREATE POLICY "Users can insert business sources"
  ON sources FOR INSERT
  WITH CHECK (auth_user_has_business_access(business_id));

CREATE POLICY "Users can update business sources"
  ON sources FOR UPDATE
  USING (auth_user_has_business_access(business_id));

CREATE POLICY "Users can delete business sources"
  ON sources FOR DELETE
  USING (auth_user_has_business_access(business_id));

-- Chunks Policies
CREATE POLICY "Users can view their business chunks"
  ON chunks FOR SELECT
  USING (auth_user_has_business_access(business_id));

CREATE POLICY "Users can insert business chunks"
  ON chunks FOR INSERT
  WITH CHECK (auth_user_has_business_access(business_id));

CREATE POLICY "Users can delete business chunks"
  ON chunks FOR DELETE
  USING (auth_user_has_business_access(business_id));

-- Conversations Policies
CREATE POLICY "Users can view their business conversations"
  ON conversations FOR SELECT
  USING (auth_user_has_business_access(business_id));

CREATE POLICY "Users can update their business conversations"
  ON conversations FOR UPDATE
  USING (auth_user_has_business_access(business_id));

CREATE POLICY "Users can delete their business conversations"
  ON conversations FOR DELETE
  USING (auth_user_has_business_access(business_id));

-- Messages Policies
CREATE POLICY "Users can view messages for their conversations"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND auth_user_has_business_access(c.business_id)
    )
  );

CREATE POLICY "Users can insert messages into their conversations"
  ON messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND auth_user_has_business_access(c.business_id)
    )
  );

-- Team Members Policies
CREATE POLICY "Users can view members of their businesses"
  ON team_members FOR SELECT
  USING (auth_user_has_business_access(business_id));

CREATE POLICY "Business owners can manage team members"
  ON team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = team_members.business_id AND b.user_id = auth.uid()
    )
  );
