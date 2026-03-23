import { AgentResponse } from "../types";

export function getReviewPrompt(keepGroup: AgentResponse[], dissentGroup: AgentResponse[], toolContext?: string): string {
  const keepText = keepGroup
    .map((r, i) => `--- Consensus Agent ${i + 1} ---\n${r.response}`)
    .join("\n\n");

  const dissentText = dissentGroup.length > 0
    ? dissentGroup.map((r, i) => `--- Dissenting Agent ${i + 1} ---\n${r.response}`).join("\n\n")
    : "None";

  let prompt = `You are an independent reviewer. A group of agents has debated a topic and reached a majority consensus. 

Below are the responses from the consensus group (those who voted to "keep" their answer) and any dissenting responses.

Consensus Group Responses:
${keepText}

Dissenting Responses:
${dissentText}

Evaluate the quality and correctness of the consensus group's output. If you believe the consensus is sound and correctly addresses the user's prompt, vote "accept". If you believe the consensus is flawed, incomplete, or requires a full redo of the debate process, vote "redo".

Use the 'vote' tool to submit your decision ("accept" or "redo") and a brief reasoning.`;

  if (toolContext) {
    prompt += `\n\nNote: ${toolContext}`;
  }

  return prompt;
}
