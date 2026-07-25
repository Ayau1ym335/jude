-- Миграция: добавить колонку created_at в таблицу trim_lines.
-- Использует IF NOT EXISTS для идемпотентности.

alter table trim_lines
  add column if not exists created_at timestamptz default now();
