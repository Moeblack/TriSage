## TODO LIST

<!-- LIMCODE_TODO_LIST_START -->
- [ ] Configuration: .env loading, validation, defaults  `#config`
- [ ] Entry point + .env.example + README  `#entry`
- [ ] Operation A: parallel generation → cross-review → vote → sub-rounds  `#opA`
- [ ] Operation B: review round with new agents, Condition C check  `#opB`
- [ ] Operation K: single agent synthesis → final response  `#opK`
- [ ] Main orchestrator: A → B → K loop with state management  `#orchestrator`
- [ ] Prompt templates for Operation A, B, K  `#prompts`
- [ ] OpenAI-compatible LLM provider with tool call support  `#provider`
- [ ] Project scaffold: package.json, tsconfig, directory structure, dependencies  `#scaffold`
- [ ] Express server with /v1/chat/completions endpoint  `#server`
- [ ] Vote tool definitions (keep/revise, accept/redo)  `#tools`
- [ ] Core types: Agent, Vote, RoundResult, Config, OpenAI-compat types  `#types`
<!-- LIMCODE_TODO_LIST_END -->

# DeepThink API — MVP Implementation Plan

## Goal
Build a working MVP that implements the core A → B → K consensus protocol with OpenAI-compatible API endpoint.

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Server**: Express.js
- **LLM Client**: OpenAI SDK (works with any OpenAI-compatible provider)
- **Build**: tsx (dev), tsup (build)

## Tasks

### 1. Project Scaffold
- Initialize package.json, tsconfig.json
- Install dependencies (express, openai, dotenv, uuid)
- Create directory structure

### 2. Core Types (`src/types.ts`)
- Agent, Vote, RoundResult, OperationResult types
- Config types
- OpenAI-compatible request/response types

### 3. Configuration (`src/config.ts`)
- Load from .env
- N (agent count), X (max review rounds), provider settings
- Validation

### 4. LLM Provider (`src/providers/openai.ts`)
- OpenAI-compatible chat completion wrapper
- Support tool calls
- Retry logic

### 5. Prompt Templates (`src/prompts/`)
- Operation A: debate prompt, cross-review prompt
- Operation B: review prompt
- Operation K: synthesis prompt

### 6. Vote Tools (`src/agents/tools.ts`)
- vote() tool definition for Operation A (keep/revise)
- vote() tool definition for Operation B (accept/redo)

### 7. Operation A (`src/orchestrator/operationA.ts`)
- Phase 1: Parallel generation
- Phase 2: Cross-review + vote
- Phase 3: Sub-rounds if needed
- Return keep_group + dissent_group

### 8. Operation B (`src/orchestrator/operationB.ts`)
- Spawn N new agents with keep + dissent context
- Collect votes (accept/redo)
- Check Condition C

### 9. Operation K (`src/orchestrator/operationK.ts`)
- Single agent synthesis
- Produce final response

### 10. Orchestrator (`src/orchestrator/orchestrator.ts`)
- Main loop: A → B → K
- State management across rounds
- Timeout handling

### 11. Server (`src/server.ts`)
- Express app
- POST /v1/chat/completions endpoint
- Request validation
- Non-streaming response (MVP)

### 12. Entry Point (`src/index.ts`)
- Load config, start server

### 13. Documentation
- README.md with usage instructions
- .env.example
