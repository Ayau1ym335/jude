-- Миграция: Включение Row Level Security (RLS) для всех таблиц базы данных Jude
-- Защищает многопользовательские данные клиник от несанкционированного доступа.

-- 1. Таблица head_landmarks (если ещё не создана)
create table if not exists head_landmarks (
  id             uuid primary key default gen_random_uuid(),
  scan_id        uuid references scans(id) on delete cascade not null unique,
  nasion         jsonb,
  tragus_left    jsonb,
  tragus_right   jsonb,
  landmarks_data jsonb,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 2. Включение RLS на всех основных таблицах
alter table clinics enable row level security;
alter table user_profiles enable row level security;
alter table patients enable row level security;
alter table scans enable row level security;
alter table projects enable row level security;
alter table project_versions enable row level security;
alter table trim_lines enable row level security;
alter table head_landmarks enable row level security;

-- 3. Политики безопасности для user_profiles
create policy "user_profiles_select_self"
  on user_profiles for select
  using (user_id = auth.uid());

create policy "user_profiles_update_self"
  on user_profiles for update
  using (user_id = auth.uid());

-- 4. Политики безопасности для clinics
create policy "clinics_select_own"
  on clinics for select
  using (
    id in (
      select clinic_id from user_profiles
      where user_id = auth.uid()
    )
  );

-- 5. Политики безопасности для patients
create policy "patients_select_own_clinic"
  on patients for select
  using (
    clinic_id in (
      select clinic_id from user_profiles
      where user_id = auth.uid()
    )
  );

create policy "patients_insert_own_clinic"
  on patients for insert
  with check (
    clinic_id in (
      select clinic_id from user_profiles
      where user_id = auth.uid()
    )
  );

create policy "patients_update_own_clinic"
  on patients for update
  using (
    clinic_id in (
      select clinic_id from user_profiles
      where user_id = auth.uid()
    )
  );

-- 6. Политики безопасности для scans
create policy "scans_select_own_clinic"
  on scans for select
  using (
    patient_id in (
      select p.id from patients p
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

create policy "scans_insert_own_clinic"
  on scans for insert
  with check (
    patient_id in (
      select p.id from patients p
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

-- 7. Политики безопасности для projects
create policy "projects_select_own_clinic"
  on projects for select
  using (
    patient_id in (
      select p.id from patients p
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

create policy "projects_insert_own_clinic"
  on projects for insert
  with check (
    patient_id in (
      select p.id from patients p
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

-- 8. Политики безопасности для project_versions
create policy "project_versions_select_own_clinic"
  on project_versions for select
  using (
    project_id in (
      select pr.id from projects pr
      join patients p on p.id = pr.patient_id
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

create policy "project_versions_insert_own_clinic"
  on project_versions for insert
  with check (
    project_id in (
      select pr.id from projects pr
      join patients p on p.id = pr.patient_id
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

-- 9. Политики безопасности для trim_lines
create policy "trim_lines_select_own_clinic"
  on trim_lines for select
  using (
    version_id in (
      select pv.id from project_versions pv
      join projects pr on pr.id = pv.project_id
      join patients p on p.id = pr.patient_id
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

create policy "trim_lines_insert_own_clinic"
  on trim_lines for insert
  with check (
    version_id in (
      select pv.id from project_versions pv
      join projects pr on pr.id = pv.project_id
      join patients p on p.id = pr.patient_id
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

-- 10. Политики безопасности для head_landmarks
create policy "head_landmarks_select_own_clinic"
  on head_landmarks for select
  using (
    scan_id in (
      select s.id from scans s
      join patients p on p.id = s.patient_id
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );

create policy "head_landmarks_upsert_own_clinic"
  on head_landmarks for all
  using (
    scan_id in (
      select s.id from scans s
      join patients p on p.id = s.patient_id
      join user_profiles up on up.clinic_id = p.clinic_id
      where up.user_id = auth.uid()
    )
  );
