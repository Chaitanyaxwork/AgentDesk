/**
 * Shared Type Definitions for AgentDesk
 */

export type WidgetConfig = {
  primary_color: string;
  text_color: string;
  welcome_message: string;
  bot_name: string;
  bot_avatar_url: string | null;
  position: 'bottom-right' | 'bottom-left';
  show_branding: boolean;
  auto_open_delay_ms: number | null;
  placeholder_text: string;
  offline_message: string;
};

export type Business = {
  id: string;
  name: string;
  website: string;
  logo_url: string | null;
  user_id: string;
  plan: 'free' | 'starter' | 'growth' | 'scale';
  created_at: string;
  widget_config: WidgetConfig;
};

export type Source = {
  id: string;
  business_id: string;
  type: 'website' | 'pdf' | 'text';
  url: string | null;
  title: string;
  content_preview: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  chunks_count: number;
  created_at: string;
  last_scraped_at: string | null;
};

export type Chunk = {
  id: string;
  source_id: string | null;
  business_id: string;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, any>;
  created_at: string;
};

export type MatchedChunk = {
  id: string;
  source_id: string | null;
  business_id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata: Record<string, any> | null;
};

export type Conversation = {
  id: string;
  business_id: string;
  visitor_id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_location: string | null;
  status: 'active' | 'resolved' | 'escalated';
  satisfaction_score: number | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message: string | null;
};

export type ConversationWithMessages = Conversation & {
  messages: Message[];
};

export type AnalyticsData = {
  sample_capped?: boolean;
  total_conversations: number;
  active_conversations: number;
  resolved_conversations: number;
  escalated_conversations: number;
  avg_response_time_ms: number;
  avg_satisfaction_score: number;
  resolution_rate: number;
  top_topics: { topic: string; count: number; trend: 'up' | 'down' | 'stable' | 'unavailable' }[];
  conversations_over_time: { date: string; count: number }[];
  satisfaction_over_time: { date: string; score: number }[];
  messages_today: number;
  busiest_hours: { hour: number; count: number }[];
};

export type TeamMember = {
  id: string;
  business_id: string;
  user_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  avatar_url: string | null;
  created_at: string;
};

export type ChatRequestBody = {
  business_id: string;
  conversation_id?: string;
  client_message_id: string;
  visitor_id: string;
  message: string;
  visitor_name?: string;
  visitor_email?: string;
  visitor_location?: string;
};

export type ChatResponseData = {
  conversation_id: string;
  message: Message;
};

export type ScrapedPage = {
  url: string;
  title: string;
  heading?: string;
  content: string;
};
