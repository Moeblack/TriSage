import { AgentResponse, ChatMessage } from "../types";
import { messagesToXml } from "../utils/messagesToXml";

export function buildReviewUserMessage(messages: ChatMessage[], keepGroup: AgentResponse[], dissentGroup: AgentResponse[], toolContext?: string): string {
  return `<task>
You are an independent reviewer. A group of agents has debated the user's request and reached a majority consensus. Evaluate the quality and correctness of their output.

You MUST call the 'vote' tool with your decision ("accept" or "redo") and reasoning. Do NOT write your decision as text.
${toolContext ? `<available_tools>${toolContext}</available_tools>` : ""}
</task>

<conversation_history>
${messagesToXml(messages)}
</conversation_history>

<consensus_responses>
${keepGroup.map((r, i) => `<agent index="${i + 1}">${r.response}</agent>`).join("\n")}
</consensus_responses>

<dissenting_responses>
${dissentGroup.length > 0 ? dissentGroup.map((r, i) => `<agent index="${i + 1}">${r.response}</agent>`).join("\n") : "None"}
</dissenting_responses>

Evaluate the consensus and call the 'vote' tool now.`;
}
