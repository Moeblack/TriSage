import { AgentResponse } from "../types";

export function getIndependentGenerationPrompt(toolContext?: string): string {
  let text = `You are a highly capable AI assistant. Provide a clear, accurate, and comprehensive answer to the user's request. Your response will be reviewed by other agents for consensus.`;
  
  if (toolContext) {
    text += toolContext;
  }
  
  return text;
}

export function getCrossReviewPrompt(ownResponse: string, otherResponses: AgentResponse[], toolContext?: string): string {
  const othersText = otherResponses
    .map((r, i) => `--- Agent ${i + 1} Response ---\n${r.response}`)
    .join("\n\n");

  let text = `You have already provided an initial response to the user. Below is your response followed by the responses from other independent agents.

Your Response:
${ownResponse}

Other Agents' Responses:
${othersText}

Please compare your response with the others. Evaluate if your response should be kept as is or if it needs revision based on superior points, corrections, or perspectives offered by other agents. 

Use the 'vote' tool to submit your decision ("keep" or "revise") and a brief reasoning.`;

  if (toolContext) {
    text += `\n\nNote: ${toolContext}`;
  }

  return text;
}
