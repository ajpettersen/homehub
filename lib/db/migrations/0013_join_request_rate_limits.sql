CREATE TABLE IF NOT EXISTS join_request_rate_limits (
  requester_hash text NOT NULL,
  client_ip_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  CONSTRAINT join_request_rate_limits_requester_ip_unique
    UNIQUE (requester_hash, client_ip_hash)
);