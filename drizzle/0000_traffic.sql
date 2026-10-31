CREATE TABLE traffic_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  visitor_hash TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  local_day TEXT NOT NULL,
  route TEXT NOT NULL,
  source TEXT NOT NULL,
  device TEXT NOT NULL,
  is_test INTEGER DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX traffic_day ON traffic_events(local_day);
--> statement-breakpoint
CREATE INDEX traffic_visitor_time ON traffic_events(visitor_hash, occurred_at);
