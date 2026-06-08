# NeuralSwitch Rewire for RAP

## Overview
NeuralSwitch is now the orchestration layer for RAP AI Assistant. The runtime flow is:

1. User message enters RAP chat API.
2. NeuralSwitch orchestrator classifies intent.
3. RBAC scope is resolved and enforced.
4. Context and scoped memory are loaded per user/session.
5. Decision engine selects tool route and model.
6. Safe execution layer runs approved tools.
7. Evidence is assembled into tables/charts/citations.
8. Reasoning layer drafts the final response.
9. Response guard masks sensitive content.
10. Structured output is returned to frontend.

## Backend Modules
Implemented under `backend/app/neuralswitch/`:

- `orchestrator.py`: end-to-end pipeline, route decisions, memory writes.
- `intent_classifier.py`: RAP intent schema with 20 intent buckets.
- `model_registry.py`: configurable model catalog and selection logic.
- `context_builder.py`: per-session memory and follow-up context.
- `router.py`: execution router for postgres/rag/document/forex/tools.
- `response_builder.py`: structured RAP answer format.
- `memory.py`: scoped conversation store.

Submodules:

- `llm/local_llm_client.py`: environment-driven local LLM client with retry + circuit breaker.
- `tools/postgres_tool.py`: safe template-based analytics execution.
- `tools/rag_tool.py`: vector retrieval + citations.
- `tools/document_tool.py`: document ingest/analysis.
- `tools/forex_tool.py`: forex route.
- `guards/*`: SQL safety, RBAC scope enforcement, prompt injection defense, output masking, rate guard.
- `analytics/*`: reusable RAP analytics functions returning structured JSON.

## APIs
New backend endpoints:

- `POST /api/neuralswitch/chat`
- `POST /api/neuralswitch/route`
- `POST /api/neuralswitch/documents/upload`
- `POST /api/neuralswitch/documents/ingest`
- `GET /api/neuralswitch/conversations`
- `GET /api/neuralswitch/conversations/{id}`
- `DELETE /api/neuralswitch/conversations/{id}`
- `POST /api/neuralswitch/feedback`

Backward compatibility:

- Existing `/api/neural-switch/*` endpoints continue to work.
- `/api/neural-switch/chat` now bridges into the new orchestrator and returns legacy `message/model/provider` fields plus structured payload.

## Local LLM Environment Variables
NeuralSwitch local LLM integration uses environment variables (no frontend key exposure):

- `LOCAL_LLM_BASE_URL`
- `LOCAL_LLM_API_KEY`
- `LOCAL_LLM_CHAT_ENDPOINT` (default `/v1/chat/completions`)
- `LOCAL_LLM_MODELS_ENDPOINT` (default `/v1/models`)
- `LOCAL_LLM_DEFAULT_MODEL`
- `LOCAL_LLM_REASONING_MODEL`
- `LOCAL_LLM_CODING_MODEL`
- `LOCAL_LLM_TIMEOUT_SECONDS`
- `LOCAL_LLM_MAX_TOKENS`
- `LOCAL_LLM_TEMPERATURE`

Optional NeuralSwitch runtime controls:

- `NEURALSWITCH_DEBUG_TRACE`
- `NEURALSWITCH_MAX_ROWS_PER_TABLE`
- `NEURALSWITCH_ENABLE_LIVE_WEB_TOOL`
- `NEURALSWITCH_RAG_MAX_CHUNKS`
- `NEURALSWITCH_MODEL_REGISTRY_JSON`

## Frontend
New modular chat UI components in `src/components/neuralswitch/`:

- `ChatLayout.tsx`
- `ChatSidebar.tsx`
- `ChatMessage.tsx`
- `ChatInput.tsx`
- `SourceCard.tsx`
- `ChartRenderer.tsx`
- `TableRenderer.tsx`
- `SuggestedQuestions.tsx`
- `FileUpload.tsx`
- `ModelTrace.tsx`

The executive NeuralSwitch page now uses this modular layout and supports:

- chat history sidebar
- new chat
- document upload
- source cards
- tables/charts rendering
- regenerate/copy/feedback actions
- admin-only decision trace display

## Security Notes
- Query execution is template-driven through approved analytics functions.
- Unsafe prompt patterns are blocked.
- RBAC scope is automatically applied to filters.
- Sensitive key patterns are masked before response output.
- NeuralSwitch APIs are protected by existing backend request auth middleware.
