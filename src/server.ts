import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import config from "./config";
import { logger } from "./utils/logger";
import { orchestrate } from "./orchestrator/orchestrator";
import { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import { createProgressEmitter, ProgressEvent } from "./orchestrator/events";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// OpenAI-compatible Chat Completion endpoint
app.post("/v1/chat/completions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { model, messages, tools, stream } = req.body as ChatCompletionRequest;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }
    const requestId = `chatcmpl-${crypto.randomUUID()}`;

    if (tools && tools.length > 0) {
      logger.info(`[TriSage] User-passed ${tools.length} tools. Will be promptified for debate, real for synthesis.`);
    }

    logger.info(`Received chat request with ${messages.length} messages. User model: ${model}`);

    if (stream) {
      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const emitter = createProgressEmitter();
      let firstChunk = true;

      const sendChunk = (delta: any, finish_reason: string | null = null) => {
        const chunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "trisage",
          choices: [{
            index: 0,
            delta,
            finish_reason
          }]
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      emitter.on("progress", (event: ProgressEvent) => {
        if (event.type === "reasoning") {
          const delta: any = {};
          if (firstChunk) {
            delta.role = "assistant";
            firstChunk = false;
          }
          delta.reasoning_content = event.data.content;
          sendChunk(delta);
        } else if (event.type === "operationK:stream") {
          const delta: any = {};
          if (firstChunk) {
            delta.role = "assistant";
            firstChunk = false;
          }
          delta.content = event.data.token;
          sendChunk(delta);
        }
      });

      try {
        const result = await orchestrate(messages, config, emitter, tools);
        
        // Handle final content if not all streamed (though operationK:stream should cover it)
        // Also handle tool calls
        if (result.toolCalls && result.toolCalls.length > 0) {
           const tool_calls = result.toolCalls.map((tc, idx) => ({
             index: idx,
             ...tc
           }));
           sendChunk({ tool_calls }, "tool_calls");
        } else {
           sendChunk({}, "stop");
        }
        
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (error: any) {
        logger.error(`Streaming orchestration failed: ${error.message}`);
        // OpenAI doesn't have a standard way to send errors mid-stream other than closing or sending a partial JSON
        res.write(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return;
    }

    // Non-streaming logic
    const result = await orchestrate(messages, config, undefined, tools);

    const hasToolCalls = result.toolCalls && result.toolCalls.length > 0;

    const response: ChatCompletionResponse = {
      id: requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "trisage",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.response || null,
            reasoning_content: result.reasoning_content || null,
            ...(hasToolCalls ? { tool_calls: result.toolCalls } : {}),
          },
          finish_reason: hasToolCalls ? "tool_calls" : "stop",
        },
      ],
      usage: {
        prompt_tokens: 0, // Simplified for MVP
        completion_tokens: 0,
        total_tokens: 0,
      },
      trisage_metadata: result.metadata,
    };

    res.json(response);
  } catch (error: any) {
    next(error);
  }
});

/** @deprecated Use /v1/chat/completions with stream: true instead */
app.post("/v1/chat/completions/stream", async (req: Request, res: Response) => {
  const { messages, tools } = req.body as ChatCompletionRequest;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }
  
  if (tools && tools.length > 0) {
    logger.info(`[TriSage] User-passed ${tools.length} tools for streaming.`);
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // res.flushHeaders() might not be available on all express versions/middlewares, but res.write will trigger it
  res.write(': ok\n\n'); 

  const emitter = createProgressEmitter();
  
  emitter.on("progress", (event: ProgressEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  try {
    const result = await orchestrate(messages, config, emitter, tools);
    res.write(`data: ${JSON.stringify({ type: "result", data: result })}\n\n`);
    res.write("data: [DONE]\n\n");
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "orchestration:error", data: { error: error.message } })}\n\n`);
    res.write("data: [DONE]\n\n");
  }
  
  res.end();
});

// Test UI endpoint
app.get("/test", (req, res) => {
  const htmlPath = path.join(__dirname, "../public/index.html");
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send("Test UI file not found. Make sure public/index.html exists.");
  }
  res.setHeader("Content-Type", "text/html");
  res.send(fs.readFileSync(htmlPath, "utf-8"));
});

app.get("/v1/models", (req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: "trisage",
        object: "model",
        created: 1718000000,
        owned_by: "trisage",
      },
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(`Internal server error: ${err.message}`, err.stack);
  res.status(500).json({
    error: {
      message: err.message || "Internal server error",
      type: "server_error",
      code: 500,
    },
  });
});

export default app;
