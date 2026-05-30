-- ─────────────────────────────────────────────────────────────────────────
-- Migration: add `theme_overrides` column to the `settings` table
-- ─────────────────────────────────────────────────────────────────────────
-- One-time, manual script for DBs created before 2026-05-27.
--
-- Adds the `theme_overrides TEXT` column used by the Appearance drawer to
-- persist the user's CSS-variable overrides server-side (so the theme
-- survives a browser-cache / localStorage clear).
--
-- This statement is harmless to skip if you started from a fresh DB
-- created against the current `schema.sql` — the column will already
-- exist and SQLite will refuse to add a duplicate.
--
-- SQLite does not support "ADD COLUMN IF NOT EXISTS". If you run this
-- script twice on the same DB the second run reports:
--     Error: duplicate column name: theme_overrides
-- That is the expected outcome confirming the column is in place.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE settings ADD COLUMN theme_overrides TEXT;

-- Verify (uncomment to print the column list after running):
-- PRAGMA table_info(settings);
