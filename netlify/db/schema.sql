CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  anonymous_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  app_version TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL,
  device_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weather_queries (
  id TEXT PRIMARY KEY,
  anonymous_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  app_version TEXT NOT NULL,
  queried_at TIMESTAMPTZ NOT NULL,
  target_date DATE NOT NULL,
  regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_count INTEGER NOT NULL CHECK (region_count >= 0),
  result_success BOOLEAN,
  api_elapsed_ms INTEGER,
  api_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  anonymous_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  app_version TEXT NOT NULL,
  event_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_version_started ON sessions(app_version, started_at);
CREATE INDEX IF NOT EXISTS idx_queries_session_success ON weather_queries(session_id, result_success);
CREATE INDEX IF NOT EXISTS idx_queries_version_date ON weather_queries(app_version, queried_at);
CREATE INDEX IF NOT EXISTS idx_events_session_name ON events(session_id, event_name);
CREATE INDEX IF NOT EXISTS idx_events_version_created ON events(app_version, created_at);
