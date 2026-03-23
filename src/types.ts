
// === Core Protocol Types ===

export interface AgentResponse {
  agentId: string;
  response: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface Vote {
  agentId: string;
  decision: "keep" | "revise" | "accept" | "redo";
  reasoning: string;
}

export interface RoundResult {
  roundNumber: number;
  phase: "debate" | "review" | "synthesis";
  responses: AgentResponse[];
  votes: Vote[];
  keepGroup: AgentResponse[];
  dissentGroup: AgentResponse[];
  timestamp: number;
}

export interface OperationAResult {
  keepGroup: AgentResponse[];
  dissentGroup: AgentResponse[];
  rounds: RoundResult[];
  totalSubRounds: number;
}

export interface OperationBResult {
  votes: Vote[];
  decision: "accept" | "redo";
  bExecutionCount: number;
  cumulativeRedoCount: number;
}

export interface OrchestrationState {
  conversationMessages: ChatMessage[];
  operationAResults: OperationAResult[];
  operationBResults: OperationBResult[];
  currentPhase: "idle" | "debate" | "review" | "synthesis";
  totalRounds: number;
}

// === OpenAI-Compatible Types ===

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: string | { type: string; function: { name: string } };
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "tool_calls" | "length";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // TriSage metadata extension
  trisage_metadata?: {
    totalRounds: number;
    operationAResults: OperationAResult[];
    operationBResults: OperationBResult[];
    synthesisModel: string;
  };
}

// === Config Types ===

export interface TriSageConfig {
  port: number;
  agentCount: number;
  maxReviewRounds: number;
  maxDebateSubRounds: number;
  llm: {
    apiKey: string;
    baseUrl: string;
    models: string[];
    temperature: number;
    maxTokens: number;
  };
  synthesisModel: string;
  agentTimeoutMs: number;
  totalTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}
