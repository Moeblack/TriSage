# DeepThink API - Design Document

## 1. Overview

DeepThink API is an open-source reasoning API that orchestrates N parallel AI agents through a structured debate-vote-synthesize protocol. Instead of relying on a single LLM call, it runs multiple agents in parallel, lets them review each other's work, vote on quality, and iteratively refine until consensus is reached.

The core insight: **consensus among independent reasoners is more reliable than any single reasoner.**

## 2. Protocol Specification

### 2.1 Terminology

| Term | Definition |
|---|---|
| **N** | Number of AI agents per round (configurable, default: 3) |
| **M** | Number of remaining agents after filtering in subsequent debate rounds |
| **X** | Maximum number of Operation B repetitions (configurable, default: 3) |
| **keep** | An agent's vote to preserve its current answer |
| **revise** | An agent's vote to modify its answer after seeing others |
| **accept** | A reviewer's vote that the current results are sufficient |
| **redo** | A reviewer's vote that another debate round is needed |

### 2.2 Operation A — Debate Round

```
Phase 1: Independent Generation
  - Send the full conversation context to N agents in parallel
  - Each agent produces an independent response

Phase 2: Cross-Review & Vote
  - Each agent receives the other N-1 agents' responses
  - Each agent calls the vote() tool: "keep" or "revise"
  - If revise > N/2: agents who voted "keep" finalize their output;
                      agents who voted "revise" enter next sub-round
  - If keep >= N/2: Operation A concludes

Phase 3: Sub-rounds (if needed)
  - M = number of agents who voted "revise"
  - Repeat Phase 1-2 with M agents
  - Continue until keep >= M/2 in any sub-round
  
Output: Two groups
  - keep_group: [{agent_id, response}]
  - dissent_group: [{agent_id, response}]
```

### 2.3 Operation B — Review Round

```
Input:
  <context>{original conversation}</context>
  <keep>{keep_group responses}</keep>
  <dissent>{dissent_group responses}</dissent>

Process:
  - Spawn N NEW agents (not reusing Operation A agents)
  - Each agent calls the vote() tool: "accept" or "redo"

Exit Condition C:
  - redo_count < N/2 × cumulative_B_executions  → proceed to Operation K
  - cumulative_B_executions >= X (max repeats)   → proceed to Operation K
  - Otherwise: archive current results, re-execute Operation A → Operation B
```

### 2.4 Operation K — Synthesis Round

```
Input:
  - Full conversation context
  - All keep_group responses (from all rounds)
  - All dissent_group responses (from all rounds)
  - Vote history and round metadata

Process:
  - Single dedicated AI agent
  - Produces the final user-facing response
  
Output: Final response to user
```

## 3. Architecture

### 3.1 System Architecture

```
                    ┌─────────────┐
                    │   Client    │
                    │  (OpenAI    │
                    │  compatible)│
                    └──────┬──────┘
                           │  POST /v1/chat/completions
                           ▼
                    ┌─────────────┐
                    │   Gateway   │
                    │  (Express)  │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────────┐
                    │   Orchestrator   │
                    │  (Core Engine)   │
                    └──────┬──────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Agent 1  │ │ Agent 2  │ │ Agent N  │
        │ (LLM)   │ │ (LLM)   │ │ (LLM)   │
        └──────────┘ └──────────┘ └──────────┘
              │            │            │
              ▼            ▼            ▼
        ┌─────────────────────────────────┐
        │         LLM Provider Pool       │
        │  (OpenAI / Gemini / Claude /    │
        │   Ollama / any OpenAI-compat)   │
        └─────────────────────────────────┘
```

### 3.2 Module Structure

```
deepthink-api/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server.ts                # Express server, OpenAI-compatible API
│   ├── config.ts                # Configuration (N, X, provider settings)
│   ├── types.ts                 # TypeScript type definitions
│   │
│   ├── orchestrator/
│   │   ├── orchestrator.ts      # Main orchestration loop (A → B → K)
│   │   ├── operationA.ts        # Debate round implementation
│   │   ├── operationB.ts        # Review round implementation
│   │   ├── operationK.ts        # Synthesis round implementation
│   │   └── voteCounter.ts       # Vote tallying logic
│   │
│   ├── agents/
│   │   ├── agentPool.ts         # Agent lifecycle management
│   │   ├── agent.ts             # Single agent wrapper
│   │   └── tools.ts             # Tool definitions (vote, keep, revise...)
│   │
│   ├── providers/
│   │   ├── providerInterface.ts # Abstract LLM provider interface
│   │   ├── openai.ts            # OpenAI / OpenAI-compatible provider
│   │   ├── gemini.ts            # Google Gemini provider
│   │   └── anthropic.ts         # Anthropic Claude provider
│   │
│   ├── prompts/
│   │   ├── debatePrompt.ts      # Operation A system prompts
│   │   ├── reviewPrompt.ts      # Operation B system prompts
│   │   └── synthesisPrompt.ts   # Operation K system prompts
│   │
│   └── utils/
│       ├── logger.ts            # Structured logging
│       ├── retry.ts             # Retry with backoff
│       └── stream.ts            # SSE streaming utilities
│
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 3.3 Key Design Decisions

#### 3.3.1 OpenAI-Compatible API

The API exposes a standard `POST /v1/chat/completions` endpoint. Any existing OpenAI SDK client can use DeepThink as a drop-in replacement. The internal multi-agent orchestration is entirely transparent to the caller.

```typescript
// Client usage — identical to OpenAI
const response = await openai.chat.completions.create({
  model: "deepthink",
  messages: [{ role: "user", content: "Prove that √2 is irrational" }],
  stream: true, // SSE streaming supported
});
```

#### 3.3.2 Streaming Strategy

During the multi-round deliberation, intermediate progress is streamed as specially formatted chunks so the client can display a real-time reasoning trace:

```
data: {"choices":[{"delta":{"content":"","reasoning":"[Round A-1] 3 agents generating..."}}]}
data: {"choices":[{"delta":{"content":"","reasoning":"[Round A-1] Vote: 1 keep, 2 revise"}}]}
data: {"choices":[{"delta":{"content":"","reasoning":"[Round A-2] 2 agents revising..."}}]}
data: {"choices":[{"delta":{"content":"","reasoning":"[Round B-1] Review: 2 accept, 1 redo"}}]}
data: {"choices":[{"delta":{"content":""}}]}  // final synthesis streams here
data: {"choices":[{"delta":{"content":"To prove that √2 is irrational..."}}]}
```

#### 3.3.3 Provider Agnostic

Each of the N agents can use a different LLM provider. This enables:
- Cost optimization (mix cheap + expensive models)
- Diversity of reasoning (different model architectures think differently)
- Fault tolerance (one provider down doesn't kill the whole request)

Configuration example:
```yaml
agents:
  - provider: openai
    model: gpt-4o
  - provider: gemini  
    model: gemini-2.5-flash
  - provider: anthropic
    model: claude-sonnet-4
```

#### 3.3.4 Tool-Based Voting

Agents express their votes through structured tool calls, not free-text parsing. This ensures deterministic vote extraction:

```typescript
// Tool definition for Operation A
const voteTools = [{
  type: "function",
  function: {
    name: "vote",
    description: "Cast your vote after reviewing other agents' responses",
    parameters: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["keep", "revise"],
          description: "keep = your answer is sufficient; revise = you want to modify"
        },
        reasoning: {
          type: "string",
          description: "Brief explanation for your vote"
        }
      },
      required: ["decision", "reasoning"]
    }
  }
}];
```

## 4. Protocol Flow — Detailed State Machine

```
                    ┌───────────┐
                    │   START   │
                    └─────┬─────┘
                          │
                          ▼
                 ┌─────────────────┐
            ┌───►│  Operation A     │
            │    │  (Debate Round)  │
            │    └────────┬────────┘
            │             │
            │             ▼
            │    ┌─────────────────┐
            │    │  keep >= N/2 ?  │──No──► Sub-round (M agents)
            │    └────────┬────────┘              │
            │             │ Yes                   │
            │             ▼                       │
            │    ┌─────────────────┐              │
            │    │  Operation B    │◄─────────────┘
            │    │  (Review Round) │
            │    └────────┬────────┘
            │             │
            │             ▼
            │    ┌──────────────────────────────┐
            │    │  Condition C met?             │
            │    │  redo < N/2 × B_count        │
            │    │  OR B_count >= X             │
            │    └────────┬─────────────────────┘
            │             │
            │        No   │   Yes
            │◄────────────┘    │
            │                  ▼
            │         ┌─────────────────┐
            │         │  Operation K    │
            │         │  (Synthesis)    │
            │         └────────┬────────┘
            │                  │
            │                  ▼
            │           ┌───────────┐
            │           │   END     │
            │           └───────────┘
```

## 5. Configuration Schema

```typescript
interface DeepThinkConfig {
  // Agent count per round
  agentCount: number;           // N, default: 3

  // Max Operation B repetitions
  maxReviewRounds: number;      // X, default: 3

  // Max sub-rounds within Operation A
  maxDebateSubRounds: number;   // default: 3

  // LLM providers for agents
  providers: ProviderConfig[];

  // Provider for Operation K (synthesis)
  synthesisProvider: ProviderConfig;

  // Timeouts
  agentTimeoutMs: number;       // default: 60000
  totalTimeoutMs: number;       // default: 300000

  // Streaming
  streamProgress: boolean;      // default: true

  // Logging
  logLevel: "debug" | "info" | "warn" | "error";
}

interface ProviderConfig {
  type: "openai" | "gemini" | "anthropic" | "custom";
  apiKey: string;
  baseUrl?: string;             // for OpenAI-compatible proxies
  model: string;
  temperature?: number;
  maxTokens?: number;
}
```

## 6. Cost & Latency Analysis

For N=3, assuming worst case (all rounds triggered):

| Phase | API Calls | Parallelism |
|---|---|---|
| Operation A, Round 1 (generate) | N = 3 | Parallel |
| Operation A, Round 1 (vote) | N = 3 | Parallel |
| Operation A, Round 2 (if needed) | M ≤ 3 | Parallel |
| Operation B, Round 1 | N = 3 | Parallel |
| Operation K | 1 | Sequential |
| **Best case total** | **7 calls** | |
| **Worst case total (X=3)** | **~40 calls** | |

Latency is dominated by sequential rounds, not parallel calls. With N=3 and typical models:
- Best case: ~10-15 seconds (A + K only)
- Typical case: ~20-30 seconds (A + B + K)
- Worst case: ~60-90 seconds (multiple A+B cycles)

## 7. Comparison with Existing Approaches

| Feature | DeepThink API | Google Deep Think | Prisma | Standard LLM |
|---|---|---|---|---|
| Multi-agent | ✅ Configurable N | ✅ Internal | ✅ Fixed roles | ❌ |
| Voting consensus | ✅ Explicit votes | ❌ Internal | ❌ | ❌ |
| Iterative refinement | ✅ Multi-round | ✅ Internal | ✅ 3 rounds max | ❌ |
| Provider agnostic | ✅ Any LLM | ❌ Gemini only | ❌ Gemini only | N/A |
| OpenAI-compatible | ✅ Drop-in | ❌ | ❌ | ✅ |
| Open source | ✅ | ❌ | ✅ | Varies |
| Transparent process | ✅ Streaming | ❌ Hidden | ✅ Visual | N/A |

## 8. MVP Scope

Phase 1 (MVP):
- [x] Core orchestrator (Operation A + B + K)
- [x] OpenAI-compatible provider
- [x] `/v1/chat/completions` endpoint (non-streaming)
- [x] Basic configuration via `.env`
- [x] Console logging of reasoning trace

Phase 2:
- [ ] SSE streaming with progress events
- [ ] Gemini & Anthropic providers
- [ ] Web UI for visualizing the debate process
- [ ] Docker deployment

Phase 3:
- [ ] Custom tool forwarding (agents can use user-defined tools)
- [ ] Persistent session history
- [ ] Cost tracking dashboard
- [ ] Webhook notifications for round completion
