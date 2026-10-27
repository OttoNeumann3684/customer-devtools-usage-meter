import { z } from "zod";

export const developerEventSchema = z.discriminatedUnion("kind", [
  z.object({
    event_id: z.string().min(1),
    customer_id: z.string().min(1),
    kind: z.literal("build"),
    duration_seconds: z.number().int().positive(),
    occurred_at: z.string().datetime()
  }).strict(),
  z.object({
    event_id: z.string().min(1),
    customer_id: z.string().min(1),
    kind: z.literal("release"),
    artifact_count: z.number().int().positive(),
    occurred_at: z.string().datetime()
  }).strict(),
  z.object({
    event_id: z.string().min(1),
    customer_id: z.string().min(1),
    kind: z.literal("diagnostic"),
    bytes_examined: z.number().int().nonnegative(),
    occurred_at: z.string().datetime()
  }).strict()
]);

export type DeveloperEvent = z.infer<typeof developerEventSchema>;
export type UsageKind = DeveloperEvent["kind"];

export interface UsageReceipt {
  event_id: string;
  customer_id: string;
  kind: UsageKind;
  units: number;
  duplicate: boolean;
}

export interface CustomerUsage {
  customer_id: string;
  total_units: number;
  by_kind: Record<UsageKind, number>;
}

export function unitsFor(event: DeveloperEvent): number {
  switch (event.kind) {
    case "build":
      return Math.ceil(event.duration_seconds / 60);
    case "release":
      return event.artifact_count * 10;
    case "diagnostic":
      return Math.ceil(event.bytes_examined / 1_000_000);
  }
}

export class UsageLedger {
  private readonly seen = new Map<string, UsageReceipt>();
  private readonly customers = new Map<string, CustomerUsage>();

  record(event: DeveloperEvent): UsageReceipt {
    const existing = this.seen.get(event.event_id);
    if (existing) return { ...existing, duplicate: true };

    const units = unitsFor(event);
    const current = this.customers.get(event.customer_id) ?? {
      customer_id: event.customer_id,
      total_units: 0,
      by_kind: { build: 0, release: 0, diagnostic: 0 }
    };
    current.total_units += units;
    current.by_kind[event.kind] += units;
    this.customers.set(event.customer_id, current);

    const receipt = {
      event_id: event.event_id,
      customer_id: event.customer_id,
      kind: event.kind,
      units,
      duplicate: false
    } satisfies UsageReceipt;
    this.seen.set(event.event_id, receipt);
    return receipt;
  }

  get(customerId: string): CustomerUsage | undefined {
    const value = this.customers.get(customerId);
    return value ? { ...value, by_kind: { ...value.by_kind } } : undefined;
  }
}
