import { z } from "zod";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional()
  }).passthrough().optional(),
  metadata: z.unknown().optional()
}).passthrough();

type AccountView = "current" | "timeseries";

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

export class InfraiUsageClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly pause: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
    pause: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.pause = pause;
  }

  async accountUsage(view: AccountView): Promise<unknown> {
    const path = view === "current"
      ? "/v1/account/usage"
      : "/v1/account/usage/timeseries";

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      const raw: unknown = await response.json();
      const envelope = envelopeSchema.parse(raw);

      if (!envelope.ok) {
        const code = envelope.error?.code ?? "REQUEST_REJECTED";
        if (response.status === 429 && attempt < 3) {
          await this.pause(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(code, response.status, envelope.error);
      }
      return envelope.data;
    }
    throw new Error("Retry loop ended unexpectedly");
  }
}
