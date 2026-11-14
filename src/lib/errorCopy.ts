import type { ApiErrorCode } from "../../shared/contract";

/** Short title for each error state. The longer message comes from the API (or client) error. */
export const ERROR_TITLES: Record<ApiErrorCode, string> = {
  INVALID_REQUEST: "Check your notes",
  PAYLOAD_TOO_LARGE: "Notes are too large",
  NOT_FOUND: "Something is misconfigured",
  AI_NOT_CONFIGURED: "AI isn't set up yet",
  AI_RATE_LIMITED: "The AI is busy",
  AI_PROVIDER_ERROR: "The AI service is unavailable",
  AI_TIMEOUT: "That took too long",
  AI_EMPTY_OUTPUT: "No study material came back",
  AI_INVALID_OUTPUT: "The AI's answer couldn't be used",
  INTERNAL_ERROR: "Something went wrong",
  NETWORK_ERROR: "You seem to be offline",
  CLIENT_TIMEOUT: "That took too long",
  BAD_RESPONSE: "Unexpected response",
};
