import { EventEmitter } from "events";

export type ProgressEventType =
  | "orchestration:start"
  | "operationA:start"
  | "operationA:phase1:start"
  | "operationA:phase1:stream"
  | "operationA:phase1:response"
  | "operationA:phase2:start"
  | "operationA:phase2:vote"
  | "operationA:subround:result"
  | "operationA:complete"
  | "operationB:start"
  | "operationB:vote"
  | "operationB:complete"
  | "operationK:start"
  | "operationK:stream"
  | "operationK:complete"
  | "orchestration:complete"
  | "reasoning"
  | "orchestration:error";

export interface ProgressEvent {
  type: ProgressEventType;
  timestamp: number;
  data: any;
}

export function createProgressEmitter(): EventEmitter {
  return new EventEmitter();
}

export function emitReasoning(emitter: EventEmitter | undefined, content: string) {
  if (emitter) {
    emitter.emit("progress", {
      type: "reasoning",
      timestamp: Date.now(),
      data: { content }
    } as ProgressEvent);
  }
}
