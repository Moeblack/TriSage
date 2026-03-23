import OpenAI from "openai";
import { ChatMessage, DeepThinkConfig, ToolDefinition, AgentResponse, Vote } from "../types";
import { logger } from "../utils/logger";
import { retry } from "../utils/retry";

export class LLMProvider {
  private client: OpenAI;
  private config: DeepThinkConfig;
  private modelIndex = 0;

  constructor(config: DeepThinkConfig) {
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
      const response = await this.client.chat.completions.create({
        model,
        messages: messages as any,
        tools: tools as any,
        tool_choice: { type: "function", function: { name: "vote" } },
        temperature: options.temperature ?? this.config.llm.temperature,
        max_tokens: options.maxTokens ?? this.config.llm.maxTokens,
      });

      const choice = response.choices[0];
      const toolCall = choice.message.tool_calls?.find((tc) => tc.function.name === "vote");

      let vote: Vote;
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
        // Fallback: try to find JSON in content if tool call fails
        logger.warn("No tool call found in response, attempting to parse content");
        vote = { agentId: crypto.randomUUID(), decision: "keep" as any, reasoning: "Fallback: no tool call found" };
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
