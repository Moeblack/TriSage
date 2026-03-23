import { EventEmitter } from "events";
import { ChatMessage, TriSageConfig, OperationAResult, OperationBResult, AgentResponse, ToolDefinition } from "../types";
import { LLMProvider } from "../providers/openai";
import { logger } from "../utils/logger";
import { withTimeout } from "../utils/retry";
import { executeOperationA } from "./operationA";
import { executeOperationB } from "./operationB";
import { executeOperationK } from "./operationK";
import { ProgressEventType } from "./events";
import { emitReasoning } from "./events";
import { toolsToPromptText } from "../utils/toolPromptify";

export async function orchestrate(
  messages: ChatMessage[],
  config: TriSageConfig,
  progressEmitter?: EventEmitter,
  userTools?: ToolDefinition[]
): Promise<{ response: string; reasoning_content: string; metadata: any; toolCalls?: any[] }> {
  const provider = new LLMProvider(config);
  
  const emit = (type: ProgressEventType, data: any = {}) => {
    if (progressEmitter) {
      progressEmitter.emit("progress", { type, timestamp: Date.now(), data });
    }
  };

  // Convert user tools to text for debate/review agents
  const toolContext = userTools && userTools.length > 0 
    ? toolsToPromptText(userTools) 
    : undefined;

  const state = {
    allOperationAResults: [] as OperationAResult[],
    allOperationBResults: [] as OperationBResult[],
    cumulativeRedoCount: 0,
    round: 1,
    reasoningContent: "",
  };

  const addReasoning = (text: string) => {
    state.reasoningContent += text;
    emitReasoning(progressEmitter, text);
  };

  emit("orchestration:start", { agentCount: config.agentCount, hasTools: !!toolContext });

  const processPromise = async () => {
    while (state.round <= config.maxReviewRounds) {
      logger.info(`--- Starting Main Orchestration Round ${state.round} ---`);
      emit("operationA:start", { round: state.round });
      addReasoning(`🔄 Operation A - Round ${state.round}\n`);

      // 1. Operation A: Debate (tools are promptified)
      const opAResult = await executeOperationA(messages, config, provider, logger, progressEmitter, toolContext, addReasoning);
      state.allOperationAResults.push(opAResult);
      emit("operationA:complete", { 
        keepCount: opAResult.keepGroup.length, 
        dissentCount: opAResult.dissentGroup.length, 
        subRounds: opAResult.totalSubRounds 
      });

      // 2. Operation B: Review (tools are promptified)
      emit("operationB:start", { round: state.round });
      const opBResult = await executeOperationB(
        messages,
        opAResult,
        state.round,
        state.cumulativeRedoCount,
        config,
        provider,
        logger,
        progressEmitter,
        toolContext,
        addReasoning
      );
      state.allOperationBResults.push(opBResult);
      state.cumulativeRedoCount = opBResult.cumulativeRedoCount;
      emit("operationB:complete", { decision: opBResult.decision, votes: opBResult.votes });

      // 3. Condition C check
      if (opBResult.decision === "accept") {
        logger.info(`Operation B decision: ACCEPT. Proceeding to synthesis.`);
        break;
      } else {
        logger.warn(`Operation B decision: REDO. Starting new debate-review round.`);
        state.round++;
      }
    }

    // 4. Operation K: Synthesis (has REAL user tools)
    emit("operationK:start", { hasTools: !!(userTools && userTools.length > 0) });
    const opKResult = await executeOperationK(
      messages,
      state.allOperationAResults,
      config,
      provider,
      logger,
      progressEmitter,
      userTools,
      addReasoning
    );
    emit("operationK:complete", { responseLength: opKResult.response.length, hasToolCalls: !!opKResult.toolCalls });

    emit("orchestration:complete", { totalRounds: state.round });

    return {
     response: opKResult.response,
      reasoning_content: state.reasoningContent,
      toolCalls: opKResult.toolCalls,
      metadata: {
        totalRounds: state.round,
        operationAResults: state.allOperationAResults,
        operationBResults: state.allOperationBResults,
        synthesisModel: config.synthesisModel,
      },
    };
  };

  try {
    return await withTimeout(
      processPromise(),
      config.totalTimeoutMs,
      "Total orchestration timeout exceeded"
    );
  } catch (error: any) {
    logger.error(`Orchestration failed: ${error.message}`);
    emit("orchestration:error", { error: error.message });
    throw error;
  }
}
