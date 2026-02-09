-- Migration: Add backfill progress tracking table
-- Created: 2026-02-09
-- Purpose: Track batch progress for backfill-historical worker to avoid subrequest limits

CREATE TABLE IF NOT EXISTS backfill_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backfill_date TEXT NOT NULL,           -- Date being backfilled (YYYY-MM-DD)
  batch_offset INTEGER NOT NULL DEFAULT 0, -- Current sensor index to start from
  total_sensors INTEGER NOT NULL,         -- Total sensors to process
  sensors_processed INTEGER NOT NULL DEFAULT 0, -- Number of sensors completed
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' or 'completed'
  started_at TEXT NOT NULL,               -- ISO8601 timestamp when backfill started
  updated_at TEXT NOT NULL,               -- ISO8601 timestamp of last update
  completed_at TEXT,                      -- ISO8601 timestamp when completed
  UNIQUE(backfill_date)
);

-- Index for quick lookups by date
CREATE INDEX IF NOT EXISTS idx_backfill_progress_date
  ON backfill_progress(backfill_date);

-- Index for finding in-progress backfills
CREATE INDEX IF NOT EXISTS idx_backfill_progress_status
  ON backfill_progress(status);
