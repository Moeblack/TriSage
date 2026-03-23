import { ChatMessage } from "../types";

/**
 * Serialize ChatMessage[] into a flat XML string for embedding in a single user message.
 * Handles system, user, assistant, tool roles, including tool_calls and tool_call_id.
 */
export function messagesToXml(messages: ChatMessage[]): string {
  return messages.map(m => {
    // Build attribute string
    const attrs = [`role="${m.role}"`];
    if (m.name) attrs.push(`name="${m.name}"`);
    if (m.tool_call_id) attrs.push(`tool_call_id="${m.tool_call_id}"`);
    
    let inner = "";
    
    // Content
    if (m.content) {
      inner += m.content;
    }
    
    // Tool calls (assistant requesting tool use)
    if (m.tool_calls && m.tool_calls.length > 0) {
      inner += "\n" + m.tool_calls.map(tc => 
        `<tool_call id="${tc.id}" function="${tc.function.name}">${tc.function.arguments}</tool_call>`
      ).join("\n");
    }
    
    return `<message ${attrs.join(" ")}>${inner}</message>`;
  }).join("\n");
}
