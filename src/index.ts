import app from "./server";
import config from "./config";
import { logger } from "./utils/logger";

logger.setLogLevel(config.logLevel);

const PORT = config.port || 3000;

app.listen(PORT, () => {
  logger.info(`--------------------------------------------------`);
  logger.info(`DeepThink API starting...`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Agent Count (N): ${config.agentCount}`);
  logger.info(`Max Review Rounds (X): ${config.maxReviewRounds}`);
  logger.info(`LLM Base URL: ${config.llm.baseUrl}`);
  logger.info(`LLM Models: ${config.llm.models.join(", ")} (round-robin)`);
  logger.info(`Synthesis Model: ${config.synthesisModel}`);
  logger.info(`Log Level: ${config.logLevel}`);
  logger.info(`--------------------------------------------------`);
});
