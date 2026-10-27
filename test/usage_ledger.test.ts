import assert from "node:assert/strict";
import test from "node:test";
import { developerEventSchema, UsageLedger } from "../src/usage_ledger.js";

test("meters three developer operations and ignores a retried event", () => {
  const ledger = new UsageLedger();
  const build = developerEventSchema.parse({
    event_id: "evt-build-42",
    customer_id: "customer-rag-lab",
    kind: "build",
    duration_seconds: 61,
    occurred_at: "2026-09-14T08:00:00.000Z"
  });
  const release = developerEventSchema.parse({
    event_id: "evt-release-7",
    customer_id: "customer-rag-lab",
    kind: "release",
    artifact_count: 2,
    occurred_at: "2026-09-14T08:05:00.000Z"
  });
  const diagnostic = developerEventSchema.parse({
    event_id: "evt-diagnostic-3",
    customer_id: "customer-rag-lab",
    kind: "diagnostic",
    bytes_examined: 1_000_001,
    occurred_at: "2026-09-14T08:10:00.000Z"
  });

  assert.equal(ledger.record(build).units, 2);
  assert.equal(ledger.record(release).units, 20);
  assert.equal(ledger.record(diagnostic).units, 2);
  assert.equal(ledger.record(build).duplicate, true);
  assert.deepEqual(ledger.get("customer-rag-lab"), {
    customer_id: "customer-rag-lab",
    total_units: 24,
    by_kind: { build: 2, release: 20, diagnostic: 2 }
  });
});
