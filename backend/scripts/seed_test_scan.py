"""
backend/scripts/seed_test_scan.py

Скрипт для разблокировки E2E-тестирования (GEO-002 в docs/blockers.md).

Выполняет:
1. Генерирует тестовый STL-файл (icosphere subdivisions=3) через trimesh
2. Создаёт пациента-заглушку в Supabase (через service key — обходит RLS)
3. Загружает STL в bucket 'scan-files'
4. Создаёт запись скана в таблице 'scans'
5. Создаёт проект, привязанный к скану

Выводит итоговые IDs: scan_id, project_id — для использования в viewer.

Использование:
    cd backend
    python scripts/seed_test_scan.py

Требования: .env.local должен содержать SUPABASE_URL и SUPABASE_SERVICE_KEY
"""

import os
import sys
import io
import tempfile
import json
import uuid
from pathlib import Path
from datetime import datetime

# Добавляем корень backend в sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Загружаем .env.local вручную (без python-dotenv)
env_path = Path(__file__).parent.parent / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SERVICE_KEY:
    print("❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не заданы в .env.local")
    sys.exit(1)

import trimesh
import httpx

# ─── Конфигурация ────────────────────────────────────────────────────────────

BUCKET = "scan-files"
# Фиксированный UUID клиники-заглушки (создаём если нет)
CLINIC_ID = "00000000-0000-0000-0000-000000000001"
PATIENT_IDENTIFIER = "TEST-E2E-001"

# ─── Supabase HTTP-клиент (service key, полный доступ) ───────────────────────

def sb_headers() -> dict:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def sb_get(path: str, params: dict | None = None) -> dict | list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = httpx.get(url, headers=sb_headers(), params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_post(path: str, data: dict) -> dict | list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = httpx.post(url, headers=sb_headers(), json=data, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_patch(path: str, data: dict, params: dict | None = None) -> dict | list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    r = httpx.patch(url, headers=sb_headers(), json=data, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def storage_upload(path: str, file_bytes: bytes, content_type: str = "model/stl") -> str:
    """Загружает файл в Supabase Storage, возвращает путь."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",  # перезаписать если уже есть
    }
    r = httpx.post(url, headers=headers, content=file_bytes, timeout=60)
    if r.status_code not in (200, 201):
        print(f"Storage error {r.status_code}: {r.text}")
        r.raise_for_status()
    body = r.json()
    # Supabase возвращает {"Key": "scan-files/<path>"}
    key = body.get("Key", f"{BUCKET}/{path}")
    stored = key[len(BUCKET) + 1:] if key.startswith(f"{BUCKET}/") else path
    return stored


# ─── Шаги ────────────────────────────────────────────────────────────────────

def step1_generate_stl() -> bytes:
    print("📐 Генерирую тестовый STL (icosphere subdivisions=3)...")
    mesh = trimesh.creation.icosphere(subdivisions=3)
    # Масштабируем до размеров стопы (~250 мм × 90 мм), чтобы bounds были реалистичны
    mesh.apply_scale(125.0)
    buf = io.BytesIO()
    mesh.export(buf, file_type="stl")
    data = buf.getvalue()
    print(f"   Сгенерировано {len(mesh.vertices)} вершин, {len(mesh.faces)} граней, {len(data) // 1024} КБ")
    return data


def step2_ensure_clinic() -> str:
    """Проверяет наличие тестовой клиники, создаёт если нет."""
    print(f"🏥 Проверяю клинику {CLINIC_ID}...")
    try:
        rows = sb_get("clinics", params={"id": f"eq.{CLINIC_ID}", "select": "id"})
        if rows:
            print("   Клиника уже существует.")
            return CLINIC_ID
    except Exception:
        pass
    # Пробуем вставить
    try:
        result = sb_post("clinics", {"id": CLINIC_ID, "name": "Test Clinic (E2E)"})
        print("   Клиника создана.")
        return CLINIC_ID
    except Exception as e:
        print(f"   ⚠️  Не удалось создать клинику: {e}")
        print("       Продолжаю без создания клиники...")
        return CLINIC_ID


def step3_ensure_patient(clinic_id: str) -> str:
    """Проверяет наличие тестового пациента, создаёт если нет."""
    print(f"👤 Проверяю пациента {PATIENT_IDENTIFIER}...")
    rows = sb_get(
        "patients",
        params={"anonymized_identifier": f"eq.{PATIENT_IDENTIFIER}", "select": "id"},
    )
    if rows:
        patient_id = rows[0]["id"]
        print(f"   Пациент уже существует: {patient_id}")
        return patient_id

    result = sb_post(
        "patients",
        {
            "clinic_id": clinic_id,
            "anonymized_identifier": PATIENT_IDENTIFIER,
            "side": "right",
        },
    )
    patient_id = result[0]["id"]
    print(f"   ✅ Пациент создан: {patient_id}")
    return patient_id


def step4_upload_stl(patient_id: str, stl_bytes: bytes) -> str:
    """Загружает STL в Supabase Storage."""
    path = f"{patient_id}/test_icosphere.stl"
    print(f"☁️  Загружаю STL в Storage: {BUCKET}/{path} ...")
    stored_path = storage_upload(path, stl_bytes)
    print(f"   ✅ Загружено: {stored_path}")
    return stored_path


def step5_create_scan(patient_id: str, file_url: str) -> str:
    """Создаёт запись скана, обходя необходимость аутентифицированного пользователя."""
    print("📋 Создаю запись скана...")
    # Находим первого пользователя из auth.users через service key
    try:
        r = httpx.get(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            params={"page": 1, "per_page": 1},
            timeout=15,
        )
        r.raise_for_status()
        users = r.json().get("users", [])
        uploaded_by = users[0]["id"] if users else None
    except Exception:
        uploaded_by = None

    record = {
        "patient_id": patient_id,
        "file_url": file_url,
        "file_format": "stl",
        "scan_source": "patient_direct",
        "validation_status": "valid",  # помечаем как valid сразу — тест ориентирован на геодезику
    }
    if uploaded_by:
        record["uploaded_by"] = uploaded_by

    result = sb_post("scans", record)
    scan_id = result[0]["id"]
    print(f"   ✅ Скан создан: {scan_id}")
    return scan_id


def step6_create_project(patient_id: str, scan_id: str) -> str:
    """Создаёт проект, привязанный к скану."""
    print("📁 Создаю проект...")
    result = sb_post(
        "projects",
        {
            "patient_id": patient_id,
            "scan_id": scan_id,
            "afo_type": "posterior_leaf_spring",
            "status": "design",
        },
    )
    project_id = result[0]["id"]
    print(f"   ✅ Проект создан: {project_id}")
    return project_id


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Seed Test Scan — E2E unblock script")
    print("=" * 60)
    print()

    stl_bytes = step1_generate_stl()
    clinic_id = step2_ensure_clinic()
    patient_id = step3_ensure_patient(clinic_id)
    file_url = step4_upload_stl(patient_id, stl_bytes)
    scan_id = step5_create_scan(patient_id, file_url)
    project_id = step6_create_project(patient_id, scan_id)

    print()
    print("=" * 60)
    print("  ✅ ГОТОВО! Данные для тестирования:")
    print("=" * 60)
    print(f"  patient_id  : {patient_id}")
    print(f"  scan_id     : {scan_id}")
    print(f"  project_id  : {project_id}")
    print()
    print(f"  Viewer URL  : http://localhost:3000/projects/{project_id}/viewer")
    print()
    print("  Следующие шаги:")
    print("  1. Войдите в систему (http://localhost:3000/login)")
    print(f"  2. Откройте viewer: /projects/{project_id}/viewer")
    print("  3. Нажмите кнопку '✏️ Линия' — активирует TrimLineDrawer")
    print("  4. Кликните по поверхности 2-4 раза — появятся точки и кривая")
    print("  5. Проверьте 'Отменить точку' и 'Завершить линию'")
    print("=" * 60)

    # Сохраняем результат в файл для удобства
    out = {
        "patient_id": patient_id,
        "scan_id": scan_id,
        "project_id": project_id,
        "viewer_url": f"http://localhost:3000/projects/{project_id}/viewer",
        "generated_at": datetime.utcnow().isoformat(),
    }
    out_path = Path(__file__).parent / "seed_result.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\n  Результат сохранён: {out_path}")


if __name__ == "__main__":
    main()
