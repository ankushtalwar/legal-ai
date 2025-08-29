export type ReviewResponse =
  | {
      flags: Array<{ clause: string; reason: string; severity?: "low" | "med" | "high" }>;
      summary: string;
      meta?: Record<string, any>;
    }
  | {
      // fallback if server returns {result: "..."} raw text
      result: string;
    };
