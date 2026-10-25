-- Миграция: переход на краниальные шлемы (cranial helmets)
-- 1. Добавляем product_type в таблицу projects со значением по умолчанию 'cranial_helmet'.
-- 2. Расширяем check-constraint на trim_lines, добавляя типы линий краниального шлема
--    (ear_cutout, forehead, lower_edge) с сохранением поддержки legacy-типов (proximal, ankle, distal).

alter table projects
  add column if not exists product_type text default 'cranial_helmet';

alter table trim_lines
  drop constraint if exists trim_lines_line_type_check;

alter table trim_lines
  add constraint trim_lines_line_type_check
  check (line_type in ('proximal', 'ankle', 'distal', 'ear_cutout', 'forehead', 'lower_edge'));
