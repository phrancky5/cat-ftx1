-- ─────────────────────────────────────────────────────────────────────────
-- CAT FTX-1  —  user database schema
-- ─────────────────────────────────────────────────────────────────────────
-- Idempotent: every statement uses IF NOT EXISTS so re-running this file on
-- an existing DB is a no-op. Per project convention we never use migrations;
-- evolutions are appended here as additional IF-NOT-EXISTS statements.
-- ─────────────────────────────────────────────────────────────────────────

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Library of individual CAT commands ─────────────────────────────────────
-- A command is a single CAT frame (with optional parameter placeholder) plus
-- metadata used by the editor (label, category, default value, etc.).
CREATE TABLE IF NOT EXISTS cat_commands (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  rig_id           TEXT    NOT NULL,                          -- always 'ftx1' for now
  name             TEXT    NOT NULL,                          -- display label, e.g. "Mode USB"
  category         TEXT    NOT NULL,                          -- frequency|mode|dsp|audio|ptt|status|panel|power|split|rit|memory|keyer
  raw_template     TEXT    NOT NULL,                          -- e.g. 'FA{hz:09d};' or 'MD02;'
  param_label      TEXT,                                       -- "Frequency (Hz)", "Watts (5-10)", …
  param_type       TEXT    NOT NULL DEFAULT 'none'             -- 'none' | 'int'
                            CHECK (param_type IN ('none','int')),
  param_default    TEXT,
  expects_response INTEGER NOT NULL DEFAULT 0
                            CHECK (expects_response IN (0,1)),
  description      TEXT,
  is_builtin       INTEGER NOT NULL DEFAULT 0
                            CHECK (is_builtin IN (0,1)),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cat_commands_rig_cat
  ON cat_commands(rig_id, category);
CREATE INDEX IF NOT EXISTS idx_cat_commands_name
  ON cat_commands(name);

-- Named macros (an ordered sequence of resolved CAT commands) ────────────
CREATE TABLE IF NOT EXISTS cat_macros (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rig_id      TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(rig_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cat_macros_rig
  ON cat_macros(rig_id);

-- Steps inside a macro ───────────────────────────────────────────────────
-- `raw_command` is the *resolved* string (parameters already substituted)
-- so a macro stays runnable even if its source command_id is later edited.
-- `command_id` is kept FYI / for editor display only.
CREATE TABLE IF NOT EXISTS cat_macro_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  macro_id    INTEGER NOT NULL REFERENCES cat_macros(id)   ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  command_id  INTEGER          REFERENCES cat_commands(id) ON DELETE SET NULL,
  raw_command TEXT    NOT NULL,
  param_value TEXT,
  delay_ms    INTEGER NOT NULL DEFAULT 100
                            CHECK (delay_ms BETWEEN 0 AND 60000),
  note        TEXT,
  UNIQUE(macro_id, position)
);

CREATE INDEX IF NOT EXISTS idx_cat_macro_steps_macro
  ON cat_macro_steps(macro_id, position);

-- User settings (appearance, call sign, etc.) ───────────────────────────
-- Per rig_id, one row holds the operator's call sign and customized colors.
-- `theme_overrides` holds a JSON object mapping CSS variable name → value
-- (e.g. {"--bg": "#101820", "--radius": "12px"}). NULL means "use the
-- defaults baked into the page's :root rule". This single JSON column
-- replaces the per-variable localStorage blob the page used to keep, so
-- appearance survives a browser-cache clear.
CREATE TABLE IF NOT EXISTS settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),        -- enforce single row
  rig_id          TEXT    NOT NULL,
  call_sign       TEXT,                                      -- operator's call (e.g., 'SP9AX')
  color_primary   TEXT    NOT NULL DEFAULT '#ff9000',        -- orange
  color_accent    TEXT    NOT NULL DEFAULT '#0a84ff',        -- blue
  color_bg        TEXT    NOT NULL DEFAULT '#0d1117',        -- dark
  font_mono       TEXT    NOT NULL DEFAULT 'Courier New',
  radius_px       INTEGER NOT NULL DEFAULT 8,
  theme_overrides TEXT,                                      -- JSON: {"--bg":"#...",...} or NULL
  -- Preset execution timing (off by default — FTX-1 is fast; enable for
  -- legacy/slow rigs e.g. Kenwood TS-850S @ 4800 bps or Raspberry Pi hosts).
  preset_timing_enabled  INTEGER NOT NULL DEFAULT 0
                         CHECK (preset_timing_enabled IN (0, 1)),
  preset_default_delay_ms INTEGER NOT NULL DEFAULT 100
                         CHECK (preset_default_delay_ms BETWEEN 0 AND 60000),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Named presets (user-friendly radio configurations) ─────────────────────
-- Like macros, but displayed in the main UI with dedicated preset buttons.
-- Presets are command sequences that the user can save and quickly recall.
CREATE TABLE IF NOT EXISTS presets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rig_id      TEXT    NOT NULL,
  name        TEXT    NOT NULL,                              -- e.g. "APRS ON", "CW QSO"
  description TEXT,
  category    TEXT,                                          -- 'mode' | 'frequency' | 'power' | 'custom'
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(rig_id, name)
);

CREATE INDEX IF NOT EXISTS idx_presets_rig
  ON presets(rig_id);

-- Steps inside a preset ──────────────────────────────────────────────────
-- Same structure as cat_macro_steps; `raw_command` is resolved at save-time.
CREATE TABLE IF NOT EXISTS preset_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id   INTEGER NOT NULL REFERENCES presets(id)       ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  command_id  INTEGER          REFERENCES cat_commands(id) ON DELETE SET NULL,
  raw_command TEXT    NOT NULL,
  param_value TEXT,
  delay_ms    INTEGER NOT NULL DEFAULT 100
                            CHECK (delay_ms BETWEEN 0 AND 60000),
  note        TEXT,
  UNIQUE(preset_id, position)
);

CREATE INDEX IF NOT EXISTS idx_preset_steps_preset
  ON preset_steps(preset_id, position);
