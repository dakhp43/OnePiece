/**
 * Live copilot pacing and trust thresholds. Silence beats noise: every rule here exists to keep
 * prompts rare, relevant, and never repeated.
 */
export const COPILOT = {
  /** Seconds between checks, at minimum. */
  MIN_CHECK_INTERVAL_S: 20,
  /** New transcript words needed before another check is worth a Gemini call. */
  MIN_NEW_WORDS: 12,
  /** Hard cap on checks per visit (about 10 minutes of conversation). */
  MAX_CHECKS_PER_VISIT: 30,
  /** Prompts per visit, in any final state. */
  MAX_PROMPTS: 3,
  /** Seconds between two prompts. */
  COOLDOWN_S: 45,
  /** No prompt before this: the visit has barely started. */
  QUIET_START_S: 30,
  /** An unanswered card leaves the screen after this. */
  EXPIRE_S: 90,
  MAX_QUESTION_WORDS: 15,
  /** Minimum model confidence for a card. */
  THRESHOLD: 0.8,
  /** Topics tracked per visit, and short facts kept per topic. */
  MAX_THREADS: 12,
  MAX_FACTS: 6,
  /** Gemini time budget for one check; a late answer is useless mid-conversation. */
  CHECK_TIMEOUT_MS: 12_000,
} as const;
