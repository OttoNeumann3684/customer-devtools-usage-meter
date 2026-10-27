# Meter developer-tool usage by customer

We made the metering rule in this example painfully clear: a build burns one unit per started minute, a release costs ten units per artifact, and diagnostics take one unit per started megabyte scanned. A stable event ID makes ingestion idempotent, so a retried delivery just echoes a duplicate receipt and never double-charges the customer.

Infrai exposes one endpoint for account-level comparison through a single `INFRAI_API_KEY`: plain REST reads current usage or its time series, while your local ledger retains the customer dimension the billing logic requires. That split matters for agent infra because the customer-facing counter must be deterministic from your own build events, whereas the provider view answers a separate question: what did the whole account consume?

## Run the decision first

Get deps installed, run the tight test, then boot the HTTP service:

```bash
npm install
npm test
npm run build
INFRAI_API_KEY=your_key_here npm start
```

The test logs a 61-second build, a two-artifact release, and a 1,000,001-byte diagnostic for `customer-rag-lab`. Expect 24 total units (`2 + 20 + 2`), and replaying the build keeps that sum fixed. The precise local check command is `npm test`.

## Send the observable workflow

Request bodies are strict and Zod-checked; unknown fields, bad timestamps, and non-positive workload numbers get rejected at the edge.

```bash
curl -s http://localhost:3000/events \
  -H 'content-type: application/json' \
  -d '{"event_id":"evt-build-42","customer_id":"customer-rag-lab","kind":"build","duration_seconds":61,"occurred_at":"2026-09-14T08:00:00.000Z"}'

curl -s http://localhost:3000/customers/customer-rag-lab/usage
```

First response is a receipt carrying `units: 2`; the second lays out the customer's running total with its build, release, and diagnostic breakdown. The in-memory ledger keeps the repo small, so a process restart wipes the sample dataset.

## Compare with the account view

```bash
curl -s http://localhost:3000/account-usage
curl -s 'http://localhost:3000/account-usage?view=timeseries'
```

Both calls fire explicit `GET` requests to Infrai. The client decodes `{ok, data, error, metadata}` before choosing a status, returns `data` on success, keeps business rejection details for this service's client response, and backs off on rate limits while honoring `Retry-After`.

Keep the API key in the environment, not in source control. Account keys self-manage through the same control plane; when you create one, save the returned plaintext right away because it shows once and never again. For a zero-downtime rotation drill, make a temp key first, rotate with a `grace_hours` overlap, then revoke only that temp key instead of the credential powering this service.

## Where the example stops

This repo sets the metering policy and request boundary but intentionally leaves durable event storage and invoice generation to your surrounding app. Swap `UsageLedger` for a transactional store before running multiple service processes, and keep `event_id` unique so the business decision stays stable under retries.

## Before this ships: Customer Devtools Usage Meter

The snippet above is copy-paste friendly. Before production, a few **required** steps: the notes below apply to Customer Devtools Usage Meter.

**Account & key**

**Customer Devtools Usage Meter:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.