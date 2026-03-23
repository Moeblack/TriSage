import { AgentResponse } from "../types";

export function getSynthesisPrompt(
  allKeepGroups: AgentResponse[][],
  allDissentGroups: AgentResponse[][],
  voteHistory: string,
  hasTools?: boolean
): string {
  const combinedKeep = allKeepGroups
    .flat()
    .map((r, i) => `[Consensus Output ${i + 1}]:\n${r.response}`)
    .join("\n\n");

  const combinedDissent = allDissentGroups
    .flat()
    .map((r, i) => `[Dissent Output ${i + 1}]:\n${r.response}`)
    .join("\n\n");

  let prompt = `You are a master synthesis agent. Your task is to produce the final, definitive response to the user's original request based on a multi-round debate process involving several expert agents.

Below is the accumulated history of consensus and dissenting responses from the process.

Consensus History:
${combinedKeep}

Dissenting History:
${combinedDissent}

Process Meta-history:
${voteHistory}

Please synthesize all this information into a single, high-quality, coherent, and accurate response that addresses the user's prompt perfectly. Resolve any minor contradictions and ensure the final output reflects the best thinking from all agents.`;

  if (hasTools) {
    prompt += `\n\nIMPORTANT: You have access to real tools. If the debate agents suggested using specific tools, or if you determine that calling a tool would improve the quality of your response, you SHOULD call the appropriate tool. Only call tools when genuinely needed.`;
  }

  return prompt;
}
