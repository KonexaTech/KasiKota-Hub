-- PROPOSED ONLY. Server-role grants require review; no customer policies or financial writes.
CREATE TABLE IF NOT EXISTS kc_delivery_state (
 order_id uuid PRIMARY KEY REFERENCES kc_orders(id) ON DELETE RESTRICT,
 job_id uuid NOT NULL, sequence bigint NOT NULL CHECK(sequence>0),
 status text NOT NULL CHECK(status IN ('searching','assigned','ready','collected','enroute','delivered','cancelled','failed')),
 occurred_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS kc_delivery_events (
 event_id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES kc_orders(id) ON DELETE RESTRICT,
 job_id uuid NOT NULL, sequence bigint NOT NULL CHECK(sequence>0),
 status text NOT NULL CHECK(status IN ('searching','assigned','ready','collected','enroute','delivered','cancelled','failed')),
 occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$')
);
ALTER TABLE kc_delivery_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE kc_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kc_delivery_state,kc_delivery_events FROM PUBLIC;

-- Durable acknowledgement of intake; one job per originating order.
CREATE TABLE IF NOT EXISTS kc_delivery_dispatches (
 order_id uuid PRIMARY KEY REFERENCES kc_orders(id) ON DELETE RESTRICT,
 job_id uuid NOT NULL UNIQUE,
 intake_status text NOT NULL CHECK(intake_status IN ('searching','assigned','ready','collected','enroute','delivered','cancelled','failed')),
 requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE kc_delivery_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kc_delivery_dispatches FROM PUBLIC;
-- Rollback: disable DELIVERY_DISPATCH_ENABLED and DELIVERY_CALLBACKS_ENABLED.
-- Preserve receipts and associations for reconciliation; never truncate/drop to roll back.
