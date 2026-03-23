import OpenAI from "openai";
import { ChatMessage, TriSageConfig, ToolDefinition, AgentResponse, Vote } from "../types";
import { logger } from "../utils/logger";
import { retry } from "../utils/retry";

export class LLMProvider {
  private client: OpenAI;
  private config: TriSageConfig;
  private modelIndex = 0;

  constructor(config: TriSageConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    });
  }

  /** Round-robin model selection with globally advancing index */
  private getNextModel(): string {
    const models = this.config.llm.models;
    const model = models[this.modelIndex % models.length];
    this.modelIndex++;
    return model;
  }

  async chatCompletion(
    messages: ChatMessage[],
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<AgentResponse> {
    return retry(async () => {
      const model = options.model || this.getNextModel();
      const response = await this.client.chat.completions.create({
        model,
        messages: messages as any,
        temperature: options.temperature ?? this.config.llm.temperature,
        max_tokens: options.maxTokens ?? this.config.llm.maxTokens,
      });

      const choice = response.choices[0];
      return {
        agentId: crypto.randomUUID(),
        response: choice.message.content || "",
        model,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    });
  }


  async chatCompletionStream(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<AgentResponse> {
    return retry(async () => {
      const model = options.model || this.getNextModel();
      const agentId = crypto.randomUUID();
      let fullContent = "";
      let promptTokens = 0;
      let completionTokens = 0;

      const stream = await this.client.chat.completions.create({
        model,
        messages: messages as any,
        temperature: options.temperature ?? this.config.llm.temperature,
        max_tokens: options.maxTokens ?? this.config.llm.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onToken(delta);
        }
        // Usage info comes in the last chunk
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || 0;
          completionTokens = chunk.usage.completion_tokens || 0;
        }
      }

      return {
        agentId,
        response: fullContent,
        model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    });
  }

  async chatCompletionWithUserTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onToken: (token: string) => void,
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<{ response: string; toolCalls?: import("../types").ToolCall[] }> {
    return retry(async () => {
      const model = options.model || this.getNextModel();
      let fullContent = "";
      const toolCallAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};
  
      const stream = await this.client.chat.completions.create({
        model,
        messages: messages as any,
        tools: tools as any,
        temperature: options.temperature ?? this.config.llm.temperature,
        max_tokens: options.maxTokens ?? this.config.llm.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });
  
      for await (const chunk of stream) {
        // Handle content delta
        const contentDelta = chunk.choices?.[0]?.delta?.content;
        if (contentDelta) {
          fullContent += contentDelta;
          onToken(contentDelta);
        }
  
        // Handle tool call deltas
        const toolCallDeltas = chunk.choices?.[0]?.delta?.tool_calls;
        if (toolCallDeltas) {
          for (const tcDelta of toolCallDeltas) {
            const idx = tcDelta.index;
            if (!toolCallAccumulator[idx]) {
              toolCallAccumulator[idx] = {
                id: tcDelta.id || "",
                name: tcDelta.function?.name || "",
                arguments: "",
              };
            }
            if (tcDelta.id) toolCallAccumulator[idx].id = tcDelta.id;
            if (tcDelta.function?.name) toolCallAccumulator[idx].name = tcDelta.function.name;
            if (tcDelta.function?.arguments) toolCallAccumulator[idx].arguments += tcDelta.function.arguments;
          }
        }
      }
  
      // Convert accumulated tool calls to our ToolCall format
      const toolCallEntries = Object.values(toolCallAccumulator);
      const toolCalls = toolCallEntries.length > 0
        ? toolCallEntries.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }))
        : undefined;
  
      return {
        response: fullContent,
        toolCalls,
      };
    });
  }

  async chatCompletionWithVote(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: { model?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<{ response: AgentResponse; vote: Vote }> {
    return retry(async () => {
      const model = options.model || this.getNextModel();

      // deepseek-reasoner (R1) does not support tool_choice; other models benefit from it
      const isReasonerModel = /reasoner|deepseek-r1/i.test(model);
      const toolChoiceOpt: Record<string, any> = isReasonerModel
        ? {}
        : { tool_choice: { type: "function", function: { name: "vote" } } };

      const response = await this.client.chat.completions.create({
        model,
        messages: messages as any,
        tools: tools as any,
        ...toolChoiceOpt,
        temperature: options.temperature ?? this.config.llm.temperature,
        max_tokens: options.maxTokens ?? this.config.llm.maxTokens,
      });

      const choice = response.choices[0];
      const toolCall = choice.message.tool_calls?.find((tc) => tc.function.name === "vote");

      let vote: Vote = { agentId: crypto.randomUUID(), decision: "keep" as any, reasoning: "Fallback: uninitialized" };
      if (toolCall) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          vote = {
            agentId: crypto.randomUUID(),
            decision: args.decision,
            reasoning: args.reasoning,
          };
        } catch (e) {
          logger.error("Failed to parse vote tool arguments", e);
          vote = { agentId: crypto.randomUUID(), decision: "keep" as any, reasoning: "Fallback: failed to parse tool call" };
        }
      } else {
        // Fallback: model didn't use tool_call, try to extract vote from content text
        const content = choice.message.content || "";
        logger.warn(`No tool call found in vote response (model=${model}). Attempting to parse content as fallback.`);

        let parsed = false;
        try {
          // Try to find a JSON object with "decision" in the content — match all valid values
          const jsonMatch = content.match(/\{[^{}]*"decision"\s*:\s*"(keep|revise|accept|redo)"[^{}]*\}/i);
          if (jsonMatch) {
            const fallbackArgs = JSON.parse(jsonMatch[0]);
            vote = {
              agentId: crypto.randomUUID(),
              decision: fallbackArgs.decision,
              reasoning: fallbackArgs.reasoning || "Parsed from content fallback",
            };
            parsed = true;
            logger.info(`Fallback content parse succeeded: decision=${fallbackArgs.decision}`);
          }
        } catch (e) {
          logger.error("Fallback content parse also failed", e);
        }

        // Even looser fallback: look for bare decision keywords in text
        if (!parsed) {
          const looseMatch = content.match(/\b(decision|vote)\b[^a-z]*(keep|revise|accept|redo)\b/i);
          if (looseMatch) {
            const decision = looseMatch[2].toLowerCase() as Vote["decision"];
            vote = {
              agentId: crypto.randomUUID(),
              decision,
              reasoning: `Parsed from loose text match in content`,
            };
            parsed = true;
            logger.info(`Loose fallback parse succeeded: decision=${decision}`);
          }
        }

        if (!parsed) {
          logger.warn("Could not extract vote from content. Defaulting to 'keep'.");
          vote = { agentId: crypto.randomUUID(), decision: "keep" as any, reasoning: "Fallback: could not parse vote from model output" };
        }
      }

      return {
        response: {
          agentId: vote.agentId,
          response: choice.message.content || "",
          model,
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0,
          },
        },
        vote,
      };
    });
  }
}
