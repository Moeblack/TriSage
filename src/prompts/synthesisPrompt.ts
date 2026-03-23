import { AgentResponse, ChatMessage } from "../types";
import { messagesToXml } from "../utils/messagesToXml";

export function buildSynthesisUserMessage(
  messages: ChatMessage[],
  allKeepGroups: AgentResponse[][],
  allDissentGroups: AgentResponse[][],
  voteHistory: string,
  hasTools?: boolean
): string {
  const combinedKeep = allKeepGroups
    .flat()
    .map((r, i) => `<consensus_output index="${i + 1}">${r.response}</consensus_output>`)
    .join("\n");

  const combinedDissent = allDissentGroups
    .flat()
    .map((r, i) => `<dissent_output index="${i + 1}">${r.response}</dissent_output>`)
    .join("\n");

  let toolTask = "";
  if (hasTools) {
    toolTask = `\n\nIMPORTANT: You have access to real tools via the API tool_calls mechanism. If the debate agents suggested using specific tools, or if you determine that calling a tool would improve the quality of your response, you SHOULD call the appropriate tool. Only call tools when genuinely needed.

CRITICAL FORMAT RULE: You MUST invoke tools ONLY through the official API tool_calls field (i.e., the structured function-calling interface provided by the model API). NEVER output tool invocations as text, markdown code blocks, XML-like tags (e.g. <tool_code>, <tool_call>), or any other inline text format. Any tool usage that does not go through the API tool_calls mechanism will be silently ignored. If you are unsure whether you can call a tool, just describe what tool you would use in plain text without attempting to simulate the call.`;
  }

  return `<task>
You are a master synthesis agent. Your task is to produce the final, definitive response to the user's original request based on a multi-round debate process involving several expert agents.
${toolTask}
</task>

<conversation_history>
${messagesToXml(messages)}
</conversation_history>

<consensus_history>
${combinedKeep}
</consensus_history>

<dissenting_history>
${combinedDissent.length > 0 ? combinedDissent : "None"}
</dissenting_history>

<process_meta_history>
${voteHistory}
</process_meta_history>

Please synthesize all this information into a single, high-quality, coherent, and accurate response that addresses the user's prompt perfectly. Resolve any minor contradictions and ensure the final output reflects the best thinking from all agents.`;
}
