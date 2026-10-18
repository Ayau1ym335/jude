-- Migration: add head_landmarks table
-- Run in Supabase SQL Editor or via supabase db push

create table if not exists head_landmarks (
  id          uuid primary key default gen_random_uuid(),
  scan_id     uuid references scans(id) on delete cascade not null,
  nasion      jsonb not null,        -- [x, y, z] in mm
  tragus_left jsonb not null,        -- [x, y, z] in mm
  tragus_right jsonb not null,       -- [x, y, z] in mm
  source      text not null default 'manual'
              check (source in ('manual', 'auto')),
  created_at  timestamptz not null default now(),
  unique (scan_id)
);

-- Enable Row Level Security
alter table head_landmarks enable row level security;

-- Allow authenticated users to read landmarks
create policy "Authenticated users can read landmarks"
  on head_landmarks for select
  to authenticated
  using (true);

-- Allow authenticated users to upsert landmarks
create policy "Authenticated users can upsert landmarks"
  on head_landmarks for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update landmarks"
  on head_landmarks for update
  to authenticated
  using (true);

-- Index for fast lookup by scan_id
create index if not exists idx_head_landmarks_scan_id on head_landmarks (scan_id);

comment on table head_landmarks is
  'Anatomical landmarks (nasion, tragus) used to define the head coordinate frame.';
comment on column head_landmarks.nasion is
  'Nasion point [x, y, z] in mm — tip of the nose or nasal bridge.';
comment on column head_landmarks.tragus_left is
  'Left tragus [x, y, z] in mm — cartilage bump at the entrance of the left ear canal.';
comment on column head_landmarks.tragus_right is
  'Right tragus [x, y, z] in mm.';
comment on column head_landmarks.source is
  'Origin of landmarks: manual (placed by clinician) or auto (PCA estimate, low confidence).';
