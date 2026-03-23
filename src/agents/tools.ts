import { ToolDefinition } from "../types";

export const debateVoteTool: ToolDefinition = {
  type: "function",
  function: {
    name: "vote",
    description: "Vote on whether to keep the current response or revise it based on comparison with other agents.",
    parameters: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["keep", "revise"],
          description: "Choose 'keep' if your response is correct and comprehensive, or 'revise' if you see improvements needed based on other perspectives."
        },
        reasoning: {
          type: "string",
          description: "Brief explanation for your vote."
        }
      },
      required: ["decision", "reasoning"]
    }
  }
};

export const reviewVoteTool: ToolDefinition = {
  type: "function",
  function: {
    name: "vote",
    description: "Vote on whether to accept the generated consensus responses or redo the debate process.",
    parameters: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["accept", "redo"],
          description: "Choose 'accept' if the provided responses are satisfactory and reach a consensus, or 'redo' if they are conflicting or incorrect."
        },
        reasoning: {
          type: "string",
          description: "Brief explanation for your vote."
        }
      },
      required: ["decision", "reasoning"]
    }
  }
};
