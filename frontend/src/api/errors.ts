export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly code?: string,
    readonly correlationId?: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type ValidationIssue = {
  loc?: Array<string | number>;
  msg?: string;
};

export function normalizeErrorDetail(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) {
    return fallback;
  }
  if ("message" in payload && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  if (!("detail" in payload)) return fallback;
  const detail = (payload as { detail: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: ValidationIssue) => {
        if (typeof item?.msg !== "string") return null;
        const location = item.loc?.slice(1).join(" → ");
        return location ? `${location}: ${item.msg}` : item.msg;
      })
      .filter((item): item is string => item !== null);
    if (messages.length) return messages.join(". ");
  }
  return fallback;
}

/**
 * Words for failures the service names only by their code. It withholds the message of
 * every outage, in case it describes the infrastructure, so these say what can be done.
 */
const CODE_WORDS: Record<string, string> = {
  malware_scanner_unavailable:
    "The malware scanner didn't answer, so the file was not taken. It may be down, or the file may be larger than it accepts: try again later, or ask an operator to check the scanner.",
};

export function codeWords(code: string | undefined): string | undefined {
  return code !== undefined && Object.hasOwn(CODE_WORDS, code) ? CODE_WORDS[code] : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
