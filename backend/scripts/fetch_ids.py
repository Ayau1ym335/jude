import sys, os
sys.path.insert(0, '.')

env_path = '.env.local'
if os.path.exists(env_path):
    for line in open(env_path).read().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            os.environ.setdefault(k.strip(), v.strip())

from app.services.database import get_supabase
db = get_supabase()

scans = db.table('scans').select('id, file_url').limit(3).execute()
print('=== SCANS ===')
for s in scans.data:
    print('  scan_id=' + s['id'] + ', file_url=' + str(s.get('file_url', '')))

vers = db.table('project_versions').select('id, project_id, mesh_url').limit(3).execute()
print('=== PROJECT VERSIONS ===')
for v in vers.data:
    print('  version_id=' + v['id'] + ', project_id=' + str(v.get('project_id', '')))
