export type ChatMode = "auto" | "general" | "rag" | "rapid" | "sql";

export type Role = "user" | "assistant" | "system";

export interface Source {
  document_id?: string | null;
  document_name: string;
  page?: number | null;
  chunk_text: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: Source[] | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  pending?: boolean;
}

export interface ChatSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
}

export interface ChatRequest {
  chat_id?: string | null;
  message: string;
  mode: ChatMode;
  model?: string;
  use_rag: boolean;
  use_web: boolean;
  document_ids: string[];
  attachments: string[];
  temperature?: number;
  max_tokens?: number;
}

export interface DocumentItem {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  chunk_count: number;
  size_bytes: number;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface AttachmentItem {
  id: string;
  chat_id?: string | null;
  filename: string;
  file_type: string;
  status: string;
  chunk_count: number;
  size_bytes: number;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
}

export interface ModelsResponse {
  default_model: string;
  models: ModelInfo[];
}

export interface AppSettings {
  provider_name?: string;
  llm_base_url?: string;
  llm_api_key?: string;
  llm_model?: string;
  default_model?: string;
  available_models?: string[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  streaming?: boolean;
  system_prompt?: string;
  rag_enabled?: boolean;
  rag_top_k?: number;
  rag_score_threshold?: number;
  chunk_size?: number;
  chunk_overlap?: number;
  embedding_model?: string;
  vector_db?: string;
  web_search_enabled?: boolean;
  web_search_provider?: string;
  web_search_api_key?: string;
  web_search_max_results?: number;
  auto_web_for_realtime?: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  models: string[];
}

// SSE stream events from /chat/stream
export type StreamEvent =
  | { type: "meta"; chat_id: string; mode: string; tool_route?: string; sources: Source[] }
  | { type: "token"; content: string }
  | { type: "error"; message: string; kind: string }
  | {
      type: "done";
      chat_id: string;
      message_id: string;
      metadata: Record<string, unknown>;
      suggested_questions: string[];
    };
