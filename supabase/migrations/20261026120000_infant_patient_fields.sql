-- Миграция: адаптация карточки пациента под младенца и гарантия product_type для cranial_helmet
-- 1. Гарантируем значение по умолчанию 'cranial_helmet' для product_type в таблице projects
alter table projects
  alter column product_type set default 'cranial_helmet';

update projects
  set product_type = 'cranial_helmet'
  where product_type is null;

-- 2. Добавляем поля младенца в таблицу patients:
--    birth_date: дата рождения младенца (для автоматического расчёта возраста в неделях и месяцах)
--    notes: клинические заметки (включая заметки по стороне патологии / деформации левое/правое пациента)
alter table patients
  add column if not exists birth_date date;

alter table patients
  add column if not exists notes text;
