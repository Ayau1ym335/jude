-- Миграция: таблица head_measurements — история измерений черепа по визитам.
-- Хранит параметры расчёта и версию алгоритма для воспроизводимости.

create table head_measurements (
  id               uuid primary key default gen_random_uuid(),
  scan_id          uuid references scans(id) not null,
  patient_id       uuid references patients(id) not null,
  measured_at      timestamptz default now(),

  -- Параметры сечения
  slice_z          numeric,   -- высота горизонтального среза (мм) над плоскостью козелков
  width_mm         numeric,   -- ширина черепа вдоль оси X (мм)
  length_mm        numeric,   -- длина черепа вдоль оси Y (мм)
  cephalic_index   numeric,   -- цефалический индекс CI = (ширина / длина) * 100 (%)
  circumference_mm numeric,   -- периметр сечения (мм)

  -- Диагонали и асимметрия
  diag_a_mm        numeric,   -- длина диагонали A (Лево-назад / Право-вперёд, мм)
  diag_b_mm        numeric,   -- длина диагонали B (Право-назад / Лево-вперёд, мм)
  cva_mm           numeric,   -- |A - B| — абсолютная разность диагоналей (CVA, мм)
  cvai_percent     numeric,   -- CVAI = |A - B| / min(A,B) * 100 (%)

  -- Параметры расчёта: диагональный угол, высота поиска оптимального среза,
  -- версия алгоритма — необходимы для воспроизводимости цифр при повторном просмотре
  params           jsonb,     -- {"diag_angle_deg": 30, "z_min": 20, "z_max": 60, ...}
  algorithm_version text default 'v0.1'
);

-- Индексы
create index idx_head_measurements_scan_id      on head_measurements(scan_id);
create index idx_head_measurements_patient_id   on head_measurements(patient_id);
create index idx_head_measurements_measured_at  on head_measurements(patient_id, measured_at desc);

-- ─── RLS: пользователи видят только данные своей клиники ─────────────────────
-- Логика повторяет паттерн из initial_schem.sql.
-- Врач из clinic_id=X не видит данные пациентов из clinic_id=Y.

alter table head_measurements enable row level security;

-- Чтение: пользователь (через user_profiles → clinic_id) видит только пациентов своей клиники
create policy "head_measurements_select_own_clinic"
  on head_measurements
  for select
  using (
    patient_id in (
      select p.id from patients p
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

-- Вставка: пользователь клиники вставляет только к своим пациентам
create policy "head_measurements_insert_own_clinic"
  on head_measurements
  for insert
  with check (
    patient_id in (
      select p.id from patients p
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );
