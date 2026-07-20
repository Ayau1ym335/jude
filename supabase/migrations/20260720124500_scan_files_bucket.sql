-- Private bucket for scan mesh files (stl/obj/ply), max 100 MB.
insert into storage.buckets (id, name, public, file_size_limit)
values ('scan-files', 'scan-files', false, 104857600)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create policy "Authenticated users can upload scan files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'scan-files');

create policy "Authenticated users can read scan files"
on storage.objects
for select
to authenticated
using (bucket_id = 'scan-files');
