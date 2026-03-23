import { EventEmitter } from "events";
import { ChatMessage, DeepThinkConfig, AgentResponse, ToolDefinition, ToolCall } from "../types";
import { LLMProvider } from "../providers/openai";
import { Logger } from "../utils/logger";
import { getSynthesisPrompt } from "../prompts/synthesisPrompt";
import { ProgressEventType } from "./events";

export interface OperationKResult {
  response: string;
  toolCalls?: ToolCall[];
}

export async function executeOperationK(
  messages: ChatMessage[],
  allResults: { keepGroup: AgentResponse[]; dissentGroup: AgentResponse[] }[],
  config: DeepThinkConfig,
  provider: LLMProvider,
  logger: Logger,
  progressEmitter?: EventEmitter,
  userTools?: ToolDefinition[],
  addReasoning?: (text: string) => void
): Promise<OperationKResult> {
  const emit = (type: ProgressEventType, data: any = {}) => {
    if (progressEmitter) {
      progressEmitter.emit("progress", { type, timestamp: Date.now(), data });
    }
  };

  logger.info(`Starting Operation K - Synthesis${userTools?.length ? ` (with ${userTools.length} user tools)` : ""}`);

  if (addReasoning) {
    addReasoning(`🔄 Operation K - Synthesis\n`);
    addReasoning(`  Synthesizing final answer...\n`);
  }

  const keepGroups = allResults.map((r) => r.keepGroup);
  const dissentGroups = allResults.map((r) => r.dissentGroup);
  
  const history = allResults
    .map((r, i) => `Round ${i + 1}: ${r.keepGroup.length} Keep, ${r.dissentGroup.length} Dissent`)
    .join("\n");

  const hasTools = !!(userTools && userTools.length > 0);
  const synthesisPrompt = getSynthesisPrompt(keepGroups, dissentGroups, history, hasTools);
  
  const finalMessages: ChatMessage[] = [
    { role: "system", content: synthesisPrompt },
    ...messages
  ];

  // If user has tools, use tool-capable completion
  if (hasTools) {
    logger.info(`Operation K: Using tool-capable completion with ${userTools!.length} user tools`);
    
    const result = await provider.chatCompletionWithUserTools(
      finalMessages,
      userTools!,
      (token: string) => {
        emit("operationK:stream", { token });
      },
      {
        model: config.synthesisModel,
        temperature: 0.3,
      }
    );

    logger.info(`Operation K complete. Response length: ${result.response.length}, Tool calls: ${result.toolCalls?.length || 0}`);
    
    return {
      response: result.response,
      toolCalls: result.toolCalls,
    };
  }

  // No user tools — standard streaming synthesis
  const synthesisResponse = await provider.chatCompletionStream(
    finalMessages,
    (token: string) => {
      emit("operationK:stream", { token });
    },
    {
      model: config.synthesisModel,
      temperature: 0.3,
    }
  );

  logger.info(`Operation K complete. Synthesized final response length: ${synthesisResponse.response.length}`);
  return { response: synthesisResponse.response };
}
