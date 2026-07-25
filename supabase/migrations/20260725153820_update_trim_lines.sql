-- Миграция: явно подтвердить/обновить ограничение line_type для PLS-линий обрезки.
-- Схема уже содержала корректное ограничение в initial_schem.sql,
-- эта миграция делает его явным идемпотентным образом.
-- Также добавляем created_at, если колонка ещё не существует.

alter table trim_lines drop constraint if exists trim_lines_line_type_check;
alter table trim_lines add constraint trim_lines_line_type_check
  check (line_type in ('proximal', 'ankle', 'distal'));

alter table trim_lines
  add column if not exists created_at timestamptz default now();
