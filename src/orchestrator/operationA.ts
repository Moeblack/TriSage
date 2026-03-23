import { EventEmitter } from "events";
import { ChatMessage, TriSageConfig, OperationAResult, RoundResult, AgentResponse, Vote } from "../types";
import { LLMProvider } from "../providers/openai";
import { Logger } from "../utils/logger";
import { getIndependentGenerationPrompt, getCrossReviewPrompt } from "../prompts/debatePrompt";
import { debateVoteTool } from "../agents/tools";
import { majorityReached } from "./voteCounter";
import { ProgressEventType } from "./events";

export async function executeOperationA(
  messages: ChatMessage[],
  config: TriSageConfig,
  provider: LLMProvider,
  logger: Logger,
  progressEmitter?: EventEmitter,
  toolContext?: string,
  addReasoning?: (text: string) => void
): Promise<OperationAResult> {
  const emit = (type: ProgressEventType, data: any = {}) => {
    if (progressEmitter) {
      progressEmitter.emit("progress", { type, timestamp: Date.now(), data });
    }
  };

  logger.info(`Starting Operation A with ${config.agentCount} agents`);

  let activeCount = config.agentCount;
  const allRounds: RoundResult[] = [];
  const finalKeepGroup: AgentResponse[] = [];
  const finalDissentGroup: AgentResponse[] = [];
  let subRound = 0;

  while (subRound < config.maxDebateSubRounds && activeCount > 0) {
    subRound++;
    logger.info(`Operation A — Sub-round ${subRound}/${config.maxDebateSubRounds} (${activeCount} agents)`);
    
    // Assign agent IDs upfront so frontend can create cards immediately
    const agentIds = Array.from({ length: activeCount }, () => crypto.randomUUID());

    // Emit agent cards creation event
    emit("operationA:phase1:start", { subRound, agentCount: activeCount, agentIds });

    // ── Phase 1: Parallel Independent Generation ──
    const systemMsg: ChatMessage = {
      role: "system",
      content: getIndependentGenerationPrompt(toolContext),
    };

    const phase1Responses: AgentResponse[] = await Promise.all(
      agentIds.map((agentId, index) =>
        provider.chatCompletionStream(
          [systemMsg, ...messages],
          (token: string) => {
            emit("operationA:phase1:stream", {
              subRound,
              agentId,
              agentIndex: index,
              token,
            });
          }
        ).then((resp) => {
          // Override the agentId to match the one we assigned
          resp.agentId = agentId;
          emit("operationA:phase1:response", {
            subRound,
            agentId,
            responsePreview: resp.response.substring(0, 200),
            fullResponse: resp.response,
          });
          
          if (addReasoning) {
            addReasoning(`  [Agent-${index}](${resp.model}) ${resp.response.substring(0, 20)}...\n`);
          }
          
          return resp;
        })
      )
    );

    logger.debug(`Phase 1 complete: ${phase1Responses.length} responses generated`);
    emit("operationA:phase2:start", { subRound });

    // ── Phase 2: Cross-Review & Vote ──
    const phase2Results = await Promise.all(
      phase1Responses.map(async (own, i) => {
        const others = phase1Responses.filter((_, j) => j !== i);
        const reviewContent = getCrossReviewPrompt(own.response, others, toolContext);
        const reviewMessages: ChatMessage[] = [
          { role: "system", content: reviewContent },
          ...messages,
        ];
        const result = await provider.chatCompletionWithVote(reviewMessages, [debateVoteTool]);
        emit("operationA:phase2:vote", { 
          subRound, 
          agentId: result.vote.agentId, 
          decision: result.vote.decision, 
          reasoning: result.vote.reasoning 
        });
        return result;
      })
    );

    // Map votes back to their original Phase 1 responses
    const votes: Vote[] = phase2Results.map((r) => r.vote);
    const keepResponses: AgentResponse[] = [];
    const reviseResponses: AgentResponse[] = [];

    phase2Results.forEach((result, i) => {
      const originalResponse = phase1Responses[i];
      // Sync agentId so vote and response match
      originalResponse.agentId = result.vote.agentId;

      if (result.vote.decision === "keep") {
        keepResponses.push(originalResponse);
      } else {
        reviseResponses.push(originalResponse);
      }
    });

    const keepCount = keepResponses.length;
    const reviseCount = reviseResponses.length;
    
    if (addReasoning) {
      const voteSummary = votes.map((v, i) => `Agent-${i} ${v.decision}`).join(", ");
      addReasoning(`  ✓ Cross-Review: ${voteSummary}\n`);
    }
    
    logger.info(`Vote results: ${keepCount} keep, ${reviseCount} revise`);
    
    const isMajorityReached = majorityReached(votes, "keep", activeCount);
    emit("operationA:subround:result", { 
      subRound, 
      keepCount, 
      reviseCount, 
      majorityReached: isMajorityReached 
    });

    allRounds.push({
      roundNumber: subRound,
      phase: "debate",
      responses: phase1Responses,
      votes,
      keepGroup: keepResponses,
      dissentGroup: reviseResponses,
      timestamp: Date.now(),
    });

    if (isMajorityReached) {
      logger.info(`Majority "keep" reached in sub-round ${subRound}`);
      finalKeepGroup.push(...keepResponses);
      finalDissentGroup.push(...reviseResponses);
      break;
    } else {
      logger.warn(`Majority "revise" in sub-round ${subRound}. ${keepCount} agents finalized, ${reviseCount} continue.`);
      finalKeepGroup.push(...keepResponses);
      activeCount = reviseCount;

      // If this was the last sub-round, remaining revise agents go to dissent
      if (subRound >= config.maxDebateSubRounds) {
        finalDissentGroup.push(...reviseResponses);
      }
    }
  }

  // Edge case: if no rounds ran at all
  if (finalKeepGroup.length === 0 && finalDissentGroup.length === 0) {
    logger.warn("Operation A produced no results — fallback to single generation");
    const fallback = await provider.chatCompletion([
      { role: "system", content: getIndependentGenerationPrompt(toolContext) },
      ...messages,
    ]);
    finalKeepGroup.push(fallback);
  }

  logger.info(`Operation A complete: ${finalKeepGroup.length} keep, ${finalDissentGroup.length} dissent, ${subRound} sub-rounds`);

  return {
    keepGroup: finalKeepGroup,
    dissentGroup: finalDissentGroup,
    rounds: allRounds,
    totalSubRounds: subRound,
  };
}
