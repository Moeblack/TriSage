import { ToolDefinition } from "../types";

/**
 * Convert user tool definitions into a human-readable text description
 * for injection into system prompts during debate/review phases.
 * 
 * Debate agents cannot call these tools, but they should be aware of
 * their existence to reason about when they might be useful.
 */
export function toolsToPromptText(tools: ToolDefinition[]): string {
  if (!tools || tools.length === 0) return "";

  const toolDescriptions = tools.map((tool, i) => {
    const fn = tool.function;
    const params = fn.parameters as any;
    
    let paramText = "  (no parameters)";
    if (params?.properties) {
      const props = Object.entries(params.properties).map(([name, schema]: [string, any]) => {
        const required = params.required?.includes(name) ? " [required]" : " [optional]";
        return `    - ${name} (${schema.type || "any"})${required}: ${schema.description || "No description"}`;
      });
      paramText = props.join("\n");
    }

    return `  ${i + 1}. ${fn.name}: ${fn.description || "No description"}\n     Parameters:\n${paramText}`;
  });

  return `\n\n[AVAILABLE TOOLS - For Reference Only]
The user's system has the following tools available. You CANNOT call these tools directly. 
However, you should be aware of their capabilities when formulating your response.
If you believe a tool should be used to answer the question properly, mention it by name in plain natural language (e.g., "This question would benefit from calling the search_web tool to get current data.").

WARNING: Do NOT attempt to simulate or mimic tool calls in any structured format such as JSON, XML tags, code blocks, or pseudo-function-call syntax. Simply name the tool and explain why it would be helpful. Any structured tool-call formatting here will pollute downstream context.

Tools:
${toolDescriptions.join("\n\n")}
[END AVAILABLE TOOLS]`;
}
