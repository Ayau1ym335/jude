# Архитектура — Jude Cranial Helmet Platform

## Обзор

```
Browser (Next.js)  →  FastAPI  →  Supabase (PostgreSQL + Storage)
                              ↘  Trimesh / pygeodesic (geometry)
```

Монорепозиторий: `backend/` (FastAPI), `frontend/` (Next.js), `supabase/` (миграции).

---

## Backend

### Структура

```
backend/app/
├── core/
│   ├── config.py            # Settings (pydantic-settings, .env)
│   ├── database.py          # get_supabase() → SupabaseClient
│   ├── auth.py              # get_current_user, require_role (JWT via Supabase)
│   ├── exceptions.py        # AppError, NotFoundError, ValidationError → HTTP handlers
│   └── clinical_defaults.py # Клинические константы (CI, CVAI, CVA пороги)
│
├── api/                     # Основные роутеры
│   ├── patients.py
│   ├── projects.py
│   ├── scans.py
│   ├── geometry.py          # /geometry/* — метрики, асимметрия, геодезика, сглаживание
│   └── trim_lines.py
│
├── routers/                 # Compatibility re-exports → app.api.*
│
├── schemas/                 # Pydantic (Request / Response модели)
│
└── services/
    ├── mesh_loader.py       # Загрузка mesh из Supabase Storage (STL/OBJ/PLY)
    ├── head_metrics.py      # Горизонтальный срез, CI, CVAI, диагонали
    ├── asymmetry.py         # Цветовая карта отклонений
    ├── geodesic_curve.py    # Кривые по поверхности (Кимелл–Сетян)
    ├── local_smoothing.py   # Добавление/снятие объёма с геодезическим затуханием
    └── versioning.py        # Сохранение новых версий mesh
```

### Аутентификация

Каждый защищённый эндпоинт получает `current_user` через `Depends(get_current_user)`.
`get_current_user` проверяет JWT-токен из заголовка `Authorization: Bearer <token>` через Supabase Auth API.
Опциональная роль: `Depends(require_role("admin"))`.

### Слой базы данных

`get_supabase()` (из `app.core.database`) возвращает `SupabaseClient`.
На всех таблицах включён Row Level Security (RLS):

| Таблица | RLS политики |
|---|---|
| patients | Только своя org (via JWT claim) |
| scans | Только через связанный patient |
| projects | Только через связанный patient |
| project_versions | Через project |
| trim_lines | Через project_version |
| measurements | Через scan/patient |

### Геометрический пайплайн

1. `mesh_loader.py` → скачивает STL/OBJ/PLY из Supabase Storage, загружает в `trimesh.Trimesh`
2. Для метрик (`head_metrics.py`): горизонтальный срез на высоте `h_slice`, вычисляет контур, CI, CVAI
3. Для геодезики (`geodesic_curve.py`): pygeodesic (алгоритм Кимелла–Сетяна) по вершинам mesh
4. Для сглаживания (`local_smoothing.py`): геодезические веса → смещение нормали × интенсивность

---

## Frontend

### Структура

```
frontend/
├── app/                    # Next.js App Router
│   ├── dashboard/          # Главная панель
│   ├── patients/           # Список и карточки пациентов
│   ├── upload/             # Загрузка STL-скана
│   └── viewer/[scanId]/    # 3D-viewer
│
├── components/             # Общие UI (ModelViewer, TrimLinesPanel, PatientPicker, …)
│
├── features/               # Доменные фичи — «умные» обёртки
│   ├── patients/           # PatientPicker.tsx, CreatePatientForm.tsx
│   ├── viewer/             # ModelViewer.tsx
│   ├── trim-lines/         # TrimLinesPanel.tsx
│   └── metrics/            # HeadMetricsPanel.tsx, HeadDynamicsChart.tsx,
│                           # HeadSectionView.tsx, MeasurementHistory.tsx
│
├── lib/
│   └── api.ts              # Типизированный fetch-клиент (без axios)
│
└── src/components/         # Унаследованные JSX-компоненты
    ├── HeadMetricsPanel.jsx
    ├── HeadDynamicsChart.jsx
    └── HeadSectionView.jsx
```

### API-клиент (`lib/api.ts`)

Все запросы к бэкенду через `api.*` методы:

```ts
import api from "@/lib/api";

const metrics = await api.geometry.computeHeadMetrics(token, { scan_id });
const patient = await api.patients.get(token, patientId);
```

Каждый метод возвращает строго типизированный ответ (интерфейсы `ScanRead`, `HeadMetricsRead`, и т.д.).

### 3D-viewer

`components/ModelViewer.tsx` — Three.js сцена с:
- `STLLoader` / `OBJLoader` / PLY-парсером
- OrbitControls (зум, вращение)
- Авто-центрирование по bounding box
- `ref`-хэндл (`ModelViewerHandle`) для программного управления камерой

### Trim-линии

`TrimLinesPanel.tsx` → отправляет массив точек на `/geometry/geodesic-curve` → получает кривую по поверхности → рендерит через `TrimLineDrawer` (canvas overlay поверх viewer).

---

## База данных (Supabase / PostgreSQL)

### Основные таблицы

```sql
patients (id, org_id, anonymized_identifier, product_type, created_at)
scans    (id, patient_id, file_url, file_format, validation_status, uploaded_at)
projects (id, patient_id, scan_id, product_type, status, created_at)
project_versions (id, project_id, mesh_url, created_at)
trim_lines (id, version_id, line_type, geometry_data)
measurements (id, scan_id, patient_id, measured_at, width_mm, length_mm,
              cephalic_index, circumference_mm, diag_a_mm, diag_b_mm,
              cva_mm, cvai_percent, params, algorithm_version)
```

### Миграции

| Файл | Описание |
|---|---|
| `20261026000000_cranial_helmet_transition.sql` | Добавляет `product_type`, расширяет типы `trim_lines` для шлемов |
| `20261026000100_enable_rls_all_tables.sql` | Включает RLS на всех таблицах |

---

## CI / CD

`.github/workflows/backend.yml` — ruff lint → ruff format check → pytest  
`.github/workflows/frontend.yml` — eslint → tsc --noEmit → jest → next build

Деплой: Frontend → Vercel, Backend → Railway/Render.

---

## Клинические константы

Файл: `backend/app/core/clinical_defaults.py`

| Константа | Значение |
|---|---|
| `CVAI_MILD_THRESHOLD` | 3.5 % |
| `CVAI_MODERATE_THRESHOLD` | 6.25 % |
| `CVAI_SEVERE_THRESHOLD` | 10.0 % |
| `CI_NORMAL_MIN / MAX` | 75 / 85 % |
| `CVA_MILD_MM` | 5 мм |
| `CVA_MODERATE_MM` | 10 мм |
| `DEFAULT_SMOOTHING_RADIUS_MM` | 15 мм |
| `DEFAULT_SMOOTHING_ITERATIONS` | 3 |
