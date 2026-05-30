-- One-time migration: preset step timing settings (for slow rigs / weak hosts).
-- Safe to re-run only before columns exist; duplicate column errors mean already applied.

ALTER TABLE settings ADD COLUMN preset_timing_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (preset_timing_enabled IN (0, 1));

ALTER TABLE settings ADD COLUMN preset_default_delay_ms INTEGER NOT NULL DEFAULT 100
  CHECK (preset_default_delay_ms BETWEEN 0 AND 60000);
