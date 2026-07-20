
create table clinics (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    name text not null,
    address text
);

create table user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    clinic_id uuid references clinics(id) on delete set null,

    full_name text,
    role text not null default 'technician'
        check (role in ('technician', 'admin')),

    created_at timestamptz default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  clinic_id uuid references clinics(id),
  anonymized_identifier text unique not null,  -- напр. "P-2026-0001", не ФИО
  side text check (side in ('left', 'right', 'both')),
  anthropometric_data jsonb  -- рост, вес, размер стопы и т.д., гибко на будущее
);

-- Сканы
create table scans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) not null,
  uploaded_by uuid references auth.users(id),
  file_url text not null,
  file_format text check (file_format in ('stl', 'obj', 'ply')),
  scan_source text check (scan_source in ('patient_direct', 'cast_negative')),  -- см. Фазу 4, инверсия
  uploaded_at timestamptz default now(),
  validation_status text default 'pending' check (validation_status in ('pending', 'valid', 'invalid')),
  validation_errors jsonb  -- структурированный список найденных проблем
);

-- Проекты (один пациент может иметь несколько проектов — напр. левая и правая стопа)
create table projects (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) not null,
  scan_id uuid references scans(id) not null,
  afo_type text default 'posterior_leaf_spring',  -- на будущее, сейчас всегда одно значение
  created_at timestamptz default now(),
  status text default 'in_progress' check (status in ('in_progress', 'exported', 'manufactured'))
);

-- Версии проекта (граф, не только линейная цепочка — задел на будущее)
create table project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) not null,
  parent_version_id uuid references project_versions(id),  -- null для первой версии
  author_type text check (author_type in ('human', 'ai')) default 'human',
  author_id uuid references auth.users(id),
  mesh_url text not null,
  created_at timestamptz default now(),
  notes text
);

-- Линии обрезки (привязаны к конкретной версии)
create table trim_lines (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references project_versions(id) not null,
  line_type text check (line_type in ('proximal', 'ankle', 'distal')),  -- три линии PLS
  geometry_data jsonb not null  -- массив 3D-координат точек кривой
);