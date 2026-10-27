-- Миграция: сохранение текущего шага и состояния процесса моделирования шлема (Helmet Workflow)

-- 1. Добавляем колонку current_step (шаги 1..6) со значением по умолчанию 1
alter table projects
  add column if not exists current_step integer default 1 check (current_step between 1 and 6);

-- 2. Добавляем поле workflow_state для сохранения промежуточного прогресса мастера
alter table projects
  add column if not exists workflow_state jsonb default '{}'::jsonb;

-- 3. Политика RLS для обновления проектов пользователями своей клиники
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'projects_update_own_clinic'
  ) then
    create policy "projects_update_own_clinic"
      on projects for update
      using (
        patient_id in (
          select p.id from patients p
          join user_profiles up on up.clinic_id = p.clinic_id
          where up.user_id = auth.uid()
        )
      );
  end if;
end $$;
