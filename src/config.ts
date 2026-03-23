import dotenv from "dotenv";
import { DeepThinkConfig } from "./types";

dotenv.config();

const config: DeepThinkConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  agentCount: parseInt(process.env.AGENT_COUNT || "3", 10),
  maxReviewRounds: parseInt(process.env.MAX_REVIEW_ROUNDS || "3", 10),
  maxDebateSubRounds: parseInt(process.env.MAX_DEBATE_SUB_ROUNDS || "3", 10),
  llm: {
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
  },
  synthesisModel: process.env.SYNTHESIS_MODEL || "gpt-4o",
  agentTimeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || "60000", 10),
  totalTimeoutMs: parseInt(process.env.TOTAL_TIMEOUT_MS || "300000", 10),
  logLevel: (process.env.LOG_LEVEL || "info") as any,
};

if (!config.llm.apiKey) {
  console.warn("[DeepThink] WARNING: LLM_API_KEY is not set.");
}

export default config;
