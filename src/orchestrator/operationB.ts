import { EventEmitter } from "events";
import { ChatMessage, DeepThinkConfig, OperationAResult, OperationBResult, Vote } from "../types";
import { LLMProvider } from "../providers/openai";
import { Logger } from "../utils/logger";
import { getReviewPrompt } from "../prompts/reviewPrompt";
import { reviewVoteTool } from "../agents/tools";
import { countVotes } from "./voteCounter";
import { ProgressEventType } from "./events";

export async function executeOperationB(
  messages: ChatMessage[],
  operationAResult: OperationAResult,
  bExecutionCount: number,
  cumulativeRedoCount: number,
  config: DeepThinkConfig,
  provider: LLMProvider,
  logger: Logger,
  progressEmitter?: EventEmitter,
  toolContext?: string,
  addReasoning?: (text: string) => void
): Promise<OperationBResult> {
  const emit = (type: ProgressEventType, data: any = {}) => {
    if (progressEmitter) {
      progressEmitter.emit("progress", { type, timestamp: Date.now(), data });
    }
  };

  logger.info(`Starting Operation B - Review Round ${bExecutionCount}`);
  
  if (addReasoning) {
    addReasoning(`🔄 Operation B - Review\n`);
  }

  // Phase 1: New Agents Reviewing the Debate Output
  const reviewPrompt = getReviewPrompt(operationAResult.keepGroup, operationAResult.dissentGroup, toolContext);
  const prompts = Array.from({ length: config.agentCount }, () => [
    { role: "system", content: reviewPrompt } as ChatMessage,
    ...messages
  ]);

  const reviewResults = await Promise.all(
    prompts.map(async (p) => {
      const result = await provider.chatCompletionWithVote(p, [reviewVoteTool]);
      emit("operationB:vote", { 
        agentId: result.vote.agentId, 
        decision: result.vote.decision, 
        reasoning: result.vote.reasoning 
      });
      return result;
    })
  );

  const votes = reviewResults.map((r) => r.vote);
  const redoCount = countVotes(votes, "redo");
  const currentCumulativeRedo = cumulativeRedoCount + redoCount;
  const acceptCount = votes.length - redoCount;

  if (addReasoning) {
    const decisionText = redoCount === 0 ? "accept" : "redo"; 
    addReasoning(`  ✓ Vote: ${decisionText} (${acceptCount}/${votes.length})\n`);
  }

  // Condition C: redo < (N/2 * bExecutionCount) OR bExecutionCount >= X
  const threshold = (config.agentCount / 2) * bExecutionCount;
  const conditionCMet = currentCumulativeRedo < threshold;
  const maxRoundsReached = bExecutionCount >= config.maxReviewRounds;

  let decision: "accept" | "redo" = "accept";
  if (!conditionCMet && !maxRoundsReached) {
    decision = "redo";
    logger.warn(`Operation B - Redo condition met. redoCount=${redoCount}, cumulativeRedo=${currentCumulativeRedo}, threshold=${threshold}`);
  } else if (maxRoundsReached) {
    logger.info(`Operation B - Max rounds (${config.maxReviewRounds}) reached. Forcing accept.`);
    decision = "accept";
  } else {
    logger.info(`Operation B - Accept condition met. redoCount=${redoCount}, cumulativeRedo=${currentCumulativeRedo}, threshold=${threshold}`);
    decision = "accept";
  }

  return {
    votes,
    decision,
    bExecutionCount,
    cumulativeRedoCount: currentCumulativeRedo,
  };
}
