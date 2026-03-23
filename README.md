好的黄毛哥哥，直接输出，你复制粘贴：

---

# 三贤者系统 / TriSage

三个 AI 辩论，投票达成共识，再由一位AI给出最终回答。OpenAI 兼容，即插即用。

## 它是什么

TriSage 是一个多智能体共识推理 API。它把一个问题同时交给多个 AI 独立回答，让它们互相评审、投票，最后由一个综合者整合所有观点输出最终回答。

整个过程对外暴露为标准的 OpenAI `/v1/chat/completions` 接口，任何支持 OpenAI 格式的客户端都可以直接调用。

## 工作原理

```
用户提问
   │
   ▼
┌──────────────────────────────────────┐
│  操作 A — 辩论                        │
│                                      │
│  Agent-0 (gemini-3-flash)  ──┐       │
│  Agent-1 (KIMI 2.5)         ├─→ 各自回答 → 互相评审 → 投票 keep/revise
│  Agent-2 (gemini-2.5-pro)   ──┘       │
│                                      │
│  多数 keep → 进入评审                  │
│  多数 revise → 子轮辩论（最多 3 轮）    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  操作 B — 评审                        │
│                                      │
│  全新的 N 个 Agent 审查辩论结果         │
│  投票 accept / redo                   │
│                                      │
│  accept → 进入综合                    │
│  redo → 回到操作 A 重新辩论            │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  操作 K — 综合                        │
│                                      │
│  一个综合者接收所有历史                 │
│  （共识 + 分歧 + 投票记录）            │
│  输出最终回答                          │
│  （如果有工具，可以真正调用）           │
└──────────────────────────────────────┘
```

## 特性

- **多模型轮询**：配置多个模型，Agent 按全局递进顺序轮流使用，天然产生视角多样性
- **OpenAI 兼容**：标准 `/v1/chat/completions`，支持流式和非流式
- **推理过程可见**：编排过程通过 `reasoning_content` 字段输出，支持 `reasoning_content` 的客户端会自动展示为可折叠的"思考过程"
- **工具调用支持**：辩论阶段以文本描述工具，综合阶段拥有真实工具调用能力
- **接入任意 OpenAI 兼容 API**：OpenAI、Gemini 中转、Ollama、各类中转站均可

## 快速开始

### 安装

```bash
git clone https://github.com/Moeblack/TriSage.git
cd TriSage
npm install
```

### 配置

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 API 信息：

```env
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini,claude-sonnet-4,gemini-2.5-pro
SYNTHESIS_MODEL=gpt-4o
```

### 启动

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run build && npm start
```

### 调用

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:3000/v1", api_key="sk-anything")

# 非流式
response = client.chat.completions.create(
    model="deepthink",
    messages=[{"role": "user", "content": "P vs NP 问题为什么重要？"}]
)
print(response.choices[0].message.content)

# 流式
stream = client.chat.completions.create(
    model="deepthink",
    messages=[{"role": "user", "content": "解释量子纠缠"}],
    stream=True
)
for chunk in stream:
    delta = chunk.choices[0].delta
    if hasattr(delta, "reasoning_content") and delta.reasoning_content:
        print(delta.reasoning_content, end="")  # 思考过程
    if delta.content:
        print(delta.content, end="")  # 最终回答
```

浏览器打开 `http://localhost:3000/test` 可以使用自带的测试 UI。

## 配置说明

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `LLM_API_KEY` | （必填） | API Key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | API 地址 |
| `LLM_MODEL` | `gpt-4o-mini` | 模型列表，逗号分隔，Agent 按全局递进顺序轮询使用 |
| `SYNTHESIS_MODEL` | 取 `LLM_MODEL` 第一个 | 综合阶段使用的模型 |
| `AGENT_COUNT` | `3` | 每轮参与的 Agent 数量 |
| `MAX_REVIEW_ROUNDS` | `3` | 操作 B 最多重复次数 |
| `MAX_DEBATE_SUB_ROUNDS` | `3` | 操作 A 内部最多辩论子轮数 |
| `LLM_TEMPERATURE` | `0.7` | 生成温度 |
| `LLM_MAX_TOKENS` | `4096` | 单次回复最大 token |
| `AGENT_TIMEOUT_MS` | `60000` | 单个 Agent 超时 |
| `TOTAL_TIMEOUT_MS` | `300000` | 整体编排超时 |
| `LOG_LEVEL` | `info` | 日志级别：debug / info / warn / error |

### 多模型轮询示例

```env
LLM_MODEL=gemini-3-flash-preview,KIMI 2.5,gemini-2.5-pro
```

Agent 按全局递进顺序选择模型，不按轮次重置：

```
Round 1 Operation A:  flash → KIMI → pro
Round 1 Operation B:  flash → KIMI → pro
Round 2 Operation A:  flash → KIMI → pro  ← 继续递进
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | 标准调用，支持 `stream: true` |
| `/v1/models` | GET | 模型列表 |
| `/health` | GET | 健康检查 |
| `/test` | GET | 测试 UI |

### 流式响应格式

流式模式下，编排过程通过 `reasoning_content` 输出，最终回答通过 `content` 输出：

```
data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"🔄 Operation A - Round 1\n"}}]}
data: {"choices":[{"delta":{"reasoning_content":"  [Agent-0](gemini-3-flash) 量子计算是利用量子力学...\n"}}]}
data: {"choices":[{"delta":{"reasoning_content":"  [Agent-1](KIMI 2.5) 量子计算是一种新型计算...\n"}}]}
data: {"choices":[{"delta":{"reasoning_content":"  ✓ Cross-Review: Agent-0 keep, Agent-1 keep\n"}}]}
data: {"choices":[{"delta":{"reasoning_content":"🔄 Operation K - Synthesis\n"}}]}
data: {"choices":[{"delta":{"content":"量子计算是一种基于量子力学原理的..."}}]}
data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

## 项目结构

```
TriSage/
├── src/
│   ├── index.ts                 入口
│   ├── server.ts                Express 路由
│   ├── config.ts                配置加载
│   ├── types.ts                 类型定义
│   ├── orchestrator/
│   │   ├── orchestrator.ts      主编排循环 A → B → K
│   │   ├── operationA.ts        辩论（并行生成 → 交叉评审 → 投票）
│   │   ├── operationB.ts        评审（投票 accept/redo）
│   │   ├── operationK.ts        综合（最终回答 + 工具调用）
│   │   ├── voteCounter.ts       投票计数
│   │   └── events.ts            事件系统
│   ├── agents/tools.ts          投票工具定义
│   ├── providers/openai.ts      LLM 调用封装（含轮询）
│   ├── prompts/                 三个阶段的 system prompt
│   └── utils/                   日志、重试、工具文本化
├── public/index.html            测试 UI
└── .env.example                 配置模板
```

## 许可证

MIT

---

就这些，你直接复制覆盖 `README.md` 就行~

---

# Trisage-三贤者系统 — 项目文档

## 一、项目起源

本项目的起点是一个想法：能否做一个开源的、基于投票共识机制的多智能体推理 API，让多个 AI 通过辩论、互评、投票、综合的流程来生成高质量回复。

在开始之前，我们做了两件准备工作：

1. **克隆了 Prisma 参考项目**（`reference_prisma/`）。Prisma 是一个基于 Google Gemini 的可视化多智能体推理引擎，采用 Manager → Experts → Synthesis 架构。我们用它作为概念参考，但没有复用其代码。

2. **搜索了 Google Deep Think 的原理**。Deep Think 是 Gemini 系列模型上的专门推理模式，核心是 System 2 思维 + 并行多假设推理。它在模型内部同时探索多条解答路径，迭代评估后选出最优解。我们的项目在应用层面复现了类似的思路，但协议设计完全不同——我们采用的是显式投票共识机制。

## 二、协议设计

整个协议由用户提出，我帮助形式化。协议分为三个操作阶段：

### 操作 A（辩论轮）

1. 将用户的完整对话上下文发送给 N 个 AI，各自独立生成回复。
2. 每个 AI 看到其他 N-1 个 AI 的回复后，通过工具调用 `vote()` 做出决定：`keep`（保留自己的回复）或 `revise`（认为需要修改）。
3. 如果 `keep >= N/2`，操作 A 结束。投 keep 的回复进入"保留组"，投 revise 的进入"异议组"。
4. 如果 `revise > N/2`，投 keep 的 AI 定稿退出，投 revise 的 AI 进入下一轮子辩论。
5. 子辩论最多进行 `maxDebateSubRounds` 轮（默认 3）。

### 操作 B（评审轮）

1. 生成 N 个全新 AI（不复用操作 A 的 AI），输入为：原始对话 + 保留组回复 + 异议组回复。
2. 每个 AI 投票：`accept`（接受当前结果）或 `redo`（需要重来）。
3. 条件 C 判断：若 `累计 redo 次数 < N/2 × 已执行操作 B 的次数`，或已达到最大重复次数 X，则进入操作 K。否则重新执行操作 A + 操作 B。

### 操作 K（综合轮）

1. 单独一个 AI 接收所有历史（全部轮次的保留组 + 异议组 + 投票记录 + 原始对话）。
2. 综合产出最终回复。
3. 如果用户传了工具（tools），这个 AI 拥有真正的工具调用能力。

## 三、技术栈

| 模块 | 选型 | 理由 |
|---|---|---|
| 运行时 | Node.js + TypeScript | 类型安全，生态好 |
| 服务器 | Express.js | 轻量，适合 API 服务 |
| LLM 客户端 | OpenAI SDK | 兼容任何 OpenAI 格式的 API（OpenAI、Gemini 中转、Ollama 等） |
| 开发工具 | tsx（开发热重载）、tsup（构建） | 快速启动，零配置 |
| 前端测试 | 单文件 HTML（无构建依赖） | 无需安装前端框架即可测试 |

## 四、项目结构

```
deepthink-api/
├── src/
│   ├── index.ts                      入口，启动服务器
│   ├── server.ts                     Express 路由（OpenAI 兼容 + SSE 流 + 测试页）
│   ├── config.ts                     从 .env 加载配置
│   ├── types.ts                      全部 TypeScript 类型定义
│   │
│   ├── orchestrator/
│   │   ├── orchestrator.ts           主编排循环 A → B → K
│   │   ├── operationA.ts             辩论轮（并行生成 → 交叉审查 → 投票 → 子轮）
│   │   ├── operationB.ts             评审轮（新 AI 投票 → 条件 C 判断）
│   │   ├── operationK.ts             综合轮（单 AI 综合，支持用户工具调用）
│   │   ├── voteCounter.ts            投票计数与多数判定
│   │   └── events.ts                 进度事件类型定义与 EventEmitter 工厂
│   │
│   ├── agents/
│   │   └── tools.ts                  vote 工具定义（keep/revise 和 accept/redo）
│   │
│   ├── providers/
│   │   └── openai.ts                 LLM 调用封装（普通/流式/带投票/带用户工具）
│   │
│   ├── prompts/
│   │   ├── debatePrompt.ts           操作 A 的系统提示词
│   │   ├── reviewPrompt.ts           操作 B 的系统提示词
│   │   └── synthesisPrompt.ts        操作 K 的系统提示词
│   │
│   └── utils/
│       ├── logger.ts                 日志（单例，支持动态设置级别）
│       ├── retry.ts                  重试（指数退避）+ 超时
│       └── toolPromptify.ts          用户工具 → 文本描述转换器
│
├── public/
│   └── index.html                    测试用 Web UI（760+ 行，暗色主题）
│
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 五、关键设计决策与取舍

### 5.1 投票机制：原生 tool calling，不是 XML/JSON 解析

**决定**：用 OpenAI 原生的 function calling 格式来实现投票。

```typescript
// 强制 AI 调用 vote 工具
tool_choice: { type: "function", function: { name: "vote" } }
```

**取舍**：
- 优点：结果是结构化的 JSON，不需要正则或启发式解析，可靠性高。
- 缺点：不支持没有 tool calling 能力的模型（某些 Ollama 模型）。
- 决定：MVP 阶段优先可靠性。后续可加 XML/JSON fallback 解析。

### 5.2 用户工具：提示词化 + 仅综合 AI 有真实工具

**决定**：辩论阶段把用户工具转成文字描述注入 system prompt，综合阶段的 AI 才拥有真正的工具调用能力。

**理由**：
- 如果 N 个辩论 AI 都能调用工具，每个 AI 都可能触发工具回调。这意味着 N 个 AI × 每个可能调多个工具 × 多轮辩论，复杂度爆炸。
- 用户工具的执行环境在用户侧，我们的服务端无法代替执行。如果辩论阶段就产生 tool_call，需要把调用回传给用户等结果，整个流程会变成多轮异步交互。
- 提示词化让辩论 AI 知道工具存在（可以建议使用），但不会实际调用。综合 AI 作为最终决策者，在一个点上集中处理工具调用，用户只需要处理一次。

**取舍**：
- 优点：架构简洁，用户体验清晰（只有最终回复可能带 tool_calls）。
- 缺点：辩论阶段的 AI 无法用工具获取实时数据来辅助推理。如果问题强依赖工具结果（如"今天天气"），辩论阶段的回答质量会受限。
- 当前方案已足够，后续可以考虑在操作 A 之前增加一个"预调用"阶段。

### 5.3 MVP 阶段不实现多 Provider 混合

**决定**：MVP 中所有 N 个 Agent 使用同一个 LLM Provider（由 `.env` 配置）。综合 AI 可以使用不同模型（`SYNTHESIS_MODEL`），但同一个 Provider。

**理由**：
- 设计文档中规划了每个 Agent 可以用不同 Provider（混合 OpenAI + Gemini + Claude），这能提高推理多样性。
- 但实现多 Provider 需要 Agent 池管理、Provider 路由逻辑、不同 SDK 的统一封装，工作量大且容易出错。
- MVP 通过 OpenAI SDK 的 `baseURL` 参数已经可以接入任何 OpenAI 兼容的 API，包括各种中转站。

**取舍**：
- 优点：实现简单，一个 Provider 类搞定。
- 缺点：所有 Agent 的"思维方式"相同（同一模型），多样性低。
- 后续 Phase 2 再实现。

### 5.4 流式输出：SSE 而非 WebSocket

**决定**：用 Server-Sent Events（SSE）推送中间进度和流式 token。

**理由**：
- OpenAI 的 streaming 接口本身就是 SSE 格式，保持一致性。
- SSE 是单向推送（服务端 → 客户端），正好符合我们的需求。
- 不需要 WebSocket 的双向通信能力。
- 前端用 `fetch` + `ReadableStream` 手动解析 SSE，因为 `EventSource` 只支持 GET 请求。

**取舍**：
- 优点：实现简单，兼容性好，标准 HTTP。
- 缺点：不能取消正在进行的请求（需要 abort controller，目前未实现）。

### 5.5 Logger 与 Config 的依赖关系

**问题**：最初 logger.ts 在模块级别 import config（获取 logLevel），config.ts 又 import types.ts，而其他所有模块都同时 import logger 和 config。这形成了潜在的循环依赖和初始化顺序问题。

**解决**：将 logger 改为不依赖 config。Logger 单例默认使用 `"info"` 级别，在 `index.ts`（入口文件）中 config 加载完毕后调用 `logger.setLogLevel(config.logLevel)` 设置。

### 5.6 types.ts 自引用

**问题**：生成的 `types.ts` 第 1 行包含 `import { ChatMessage, OperationAResult, OperationBResult } from "./types"`——自己引用自己。

**解决**：直接删除该行。所有类型定义在同一文件中，不需要自引用。

### 5.7 LLM_TEMPERATURE 等配置项是否必填

**决定**：所有配置项都有默认值。唯一必须设置的是 `LLM_API_KEY`。

```typescript
temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),  // 不设就是 0.7
```

这让用户可以用最少的配置启动项目。

## 六、LLMProvider 的四个方法

`src/providers/openai.ts` 中的 `LLMProvider` 类是整个项目的 LLM 调用核心，有四个方法，各有用途：

| 方法 | 用途 | 是否流式 | 是否带工具 |
|---|---|---|---|
| `chatCompletion` | 普通调用（fallback 用） | 否 | 否 |
| `chatCompletionStream` | 操作 A Phase 1 生成、操作 K 无工具综合 | 是 | 否 |
| `chatCompletionWithVote` | 操作 A Phase 2 投票、操作 B 投票 | 否 | 是（内部 vote 工具） |
| `chatCompletionWithUserTools` | 操作 K 带用户工具综合 | 是 | 是（用户工具） |

`chatCompletionWithVote` 使用 `tool_choice: { type: "function", function: { name: "vote" } }` 强制模型调用 vote 工具。

`chatCompletionWithUserTools` 不强制调用任何工具（模型自行决定是否调用），同时支持流式输出内容。它需要在流式过程中同时累积 `delta.content` 和 `delta.tool_calls`，因为 OpenAI 的 tool call 是分片传输的（arguments 会拆成多个 chunk）。

## 七、事件系统

`src/orchestrator/events.ts` 定义了 18 种进度事件类型：

```
orchestration:start / complete / error
operationA:start / complete
operationA:phase1:start / stream / response
operationA:phase2:start / vote
operationA:subround:result
operationB:start / vote / complete
operationK:start / stream / complete
```

这些事件通过 Node.js 的 `EventEmitter` 传递。`orchestrate()` 函数接受一个可选的 `progressEmitter` 参数。SSE 端点创建一个 emitter，监听 `"progress"` 事件并直接 `res.write()` 给前端。

`operationA:phase1:stream` 和 `operationK:stream` 是后来加的，用于实现逐 token 的流式输出。前端收到这些事件后，把 token 追加到对应的 Agent 卡片或最终回复区域。

## 八、Web UI

`public/index.html` 是一个 760 行的单文件，包含全部 HTML、CSS、JavaScript，无任何外部依赖。

视觉风格：暗色主题（`#0f0f17`），霓虹紫强调色（`#7c3aed`），绿色表示 keep/accept，琥珀色表示 revise，红色表示 redo/error。

核心功能：
- 配置面板（API 端点、模型 ID、系统提示词）
- 输入区域 + 发送按钮
- 实时进度视图：每个操作显示为可折叠卡片，Agent 回复有打字机光标动画
- Agent 卡片在 `phase1:start` 事件到达时立即创建（空白），`phase1:stream` 事件逐 token 填充
- 最终回复区域在 `operationK:stream` 第一个 token 到达时显示
- 底部状态栏：运行状态指示灯（呼吸灯动画）、计时器、轮次计数

前端通过 `fetch` + `ReadableStream` 手动解析 SSE（因为 `EventSource` 只支持 GET，而我们的端点是 POST）。

## 九、API 兼容性

对外暴露的接口完全兼容 OpenAI 格式：

| 端点 | 方法 | 说明 |
|---|---|---|
| `/v1/chat/completions` | POST | 标准调用，等全部完成后返回 |
| `/v1/chat/completions/stream` | POST | SSE 流式，实时推送中间事件 |
| `/v1/models` | GET | 返回模型列表（`deepthink`） |
| `/health` | GET | 健康检查 |
| `/test` | GET | 返回 Web UI 页面 |

任何 OpenAI SDK 客户端可以直接使用：

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:3000/v1", api_key="anything")
response = client.chat.completions.create(
    model="deepthink",
    messages=[{"role": "user", "content": "..."}]
)
```

当用户传入 `tools` 参数时：
- 辩论 AI 在提示词中看到工具的文字描述
- 综合 AI 拥有真实的工具调用能力
- 如果综合 AI 调用了工具，响应的 `finish_reason` 为 `"tool_calls"`，`message.tool_calls` 包含调用详情

## 十、开发过程中遇到的问题

1. **types.ts 自引用**：代码生成时产生了 `import { ... } from "./types"` 的自引用。直接删除。

2. **logger 循环依赖**：logger 模块级别 import config → config import types → 其他模块同时 import logger + config。改为 logger 不依赖 config，启动时手动设置 logLevel。

3. **operationA.ts 中 getCrossReviewPrompt 被调用两次**：第一版代码在 Phase 2 中先调用一次赋值给变量，又在构建 messages 时调用了第二次。重写整个 Phase 2 逻辑。

4. **debatePrompt.ts 中变量名冲突**：`getCrossReviewPrompt` 函数中先 `return` 了模板字符串，后面追加 toolContext 的代码永远执行不到，且 `prompt` 变量名和同作用域的函数签名冲突。将局部变量改名为 `text`。

5. **流式 tool call 的累积**：OpenAI SDK 的流式 tool call 是分片传输的。`delta.tool_calls[].function.arguments` 会被拆成多个 chunk，需要用累积器按 index 拼接。`chatCompletionWithUserTools` 方法中用 `toolCallAccumulator` 对象处理。

## 十一、成本与延迟分析

以 N=3 为例：

| 阶段 | API 调用数 | 并发方式 |
|---|---|---|
| 操作 A Phase 1（生成） | 3 | 并行 |
| 操作 A Phase 2（投票） | 3 | 并行 |
| 操作 B（评审投票） | 3 | 并行 |
| 操作 K（综合） | 1 | 顺序 |
| **最佳情况合计** | **10** | |
| **最坏情况（X=3 轮全部 redo）** | **~40** | |

延迟由顺序轮次决定，不由并行调用数决定：
- 最佳情况：约 10-15 秒（A + B + K 各一轮）
- 最坏情况：约 60-90 秒（多轮 A+B 循环）

## 十二、后续规划

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 1 (MVP) | 核心协议 A→B→K、OpenAI 兼容 API、流式输出、Web UI、用户工具传递 | ✅ 完成 |
| Phase 2 | 多 Provider 混合、Gemini/Anthropic 原生支持、Docker 部署 | 待做 |
| Phase 3 | 用户工具在辩论阶段的预调用、持久化会话、成本追踪、请求取消 | 待做 |

---

以上就是本项目从构想到实现的完整记录。