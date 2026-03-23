import { Vote } from "../types";

export function countVotes(votes: Vote[], decision: string): number {
  return votes.filter((v) => v.decision === decision).length;
}

export function majorityReached(votes: Vote[], decision: string, total: number): boolean {
  return countVotes(votes, decision) >= total / 2;
}
