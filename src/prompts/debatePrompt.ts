import { AgentResponse, ChatMessage } from "../types";
import { messagesToXml } from "../utils/messagesToXml";

export function buildGenerationUserMessage(messages: ChatMessage[], toolContext?: string): string {
  return `<task>
You are a highly capable AI assistant. Provide a clear, accurate, and comprehensive answer to the user's request. Your response will be reviewed by other agents for consensus.
${toolContext ? toolContext : ""}
</task>

<conversation_history>
${messagesToXml(messages)}
</conversation_history>

Based on the conversation above, provide your response.`;
}

export function buildCrossReviewUserMessage(messages: ChatMessage[], ownResponse: string, otherResponses: AgentResponse[], toolContext?: string): string {
  return `<task>
You have provided an initial response to the user's request. Other agents also provided independent responses. Compare them and decide if your response should be kept or revised.

You MUST call the 'vote' tool with your decision ("keep" or "revise") and reasoning. Do NOT write your decision as text.
${toolContext ? `<available_tools>${toolContext}</available_tools>` : ""}
</task>

<conversation_history>
${messagesToXml(messages)}
</conversation_history>

<your_response>
${ownResponse}
</your_response>

<other_agent_responses>
${otherResponses.map((r, i) => `<agent index="${i + 1}">${r.response}</agent>`).join("\n")}
</other_agent_responses>

Compare the responses and call the 'vote' tool now.`;
}
