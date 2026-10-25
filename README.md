# Jude — Cranial Helmet Platform

Веб-приложение для ортопедических клиник и производителей **краниальных шлемов-реформеров** для младенцев.
Управление пациентами, валидация и обработка 3D-сканов головы (STL, OBJ, PLY), проектирование шлемов.

## 🚀 Ключевые возможности

| Область | Описание |
|---|---|
| Пациенты и проекты | Сквозной флоу: карточка пациента → скан → проект шлема → версии |
| Валидация скана | Проверка manifoldness, watertightness, физических размеров |
| Метрики головы | Обхват, CI, CVA/CVAI, диагонали — по горизонтальному срезу |
| 3D-viewer | Three.js (STL/OBJ/PLY), зум, авто-центрирование |
| Trim-линии | Геодезические кривые (алгоритм Кимелла–Сетяна) для разметки вырезов шлема |
| Локальная коррекция | Добавление/снятие объёма с геодезическим затуханием |
| Версионирование | Каждая правка — отдельная версия проекта |
| Безопасность | Supabase Auth (JWT), RLS на всех таблицах |

## 🛠 Стек

| Слой | Технология |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Three.js |
| Backend | FastAPI, Python 3.12, Trimesh, pygeodesic |
| БД / Хранилище / Auth | Supabase (PostgreSQL + Storage + Auth) |
| Lint / Тесты | ESLint, tsc --noEmit, Jest · Ruff, Pytest |

## 📁 Структура проекта

```text
jude/
├── backend/
│   ├── app/
│   │   ├── api/            # Роутеры API (patients, projects, scans, geometry, trim-lines)
│   │   │   └── geometry.py # Метрики головы, асимметрия, геодезика, сглаживание
│   │   ├── core/           # Конфиг, DB, Auth, исключения, клинические константы
│   │   ├── routers/        # Compatibility re-exports → app/api/
│   │   ├── schemas/        # Pydantic модели
│   │   └── services/       # Бизнес-логика (mesh_loader, asymmetry, head_metrics, …)
│   ├── tests/              # pytest (unit + rls)
│   └── scripts/            # seed_test_scan, fetch_ids
│
├── frontend/
│   ├── app/                # Next.js App Router (dashboard, patients, upload, viewer)
│   ├── components/         # Общие UI-компоненты (ModelViewer, TrimLinesPanel, …)
│   ├── features/           # Доменные фичи (patients/, viewer/, trim-lines/, metrics/)
│   ├── lib/
│   │   └── api.ts          # Централизованный типизированный API-клиент
│   └── src/components/     # Унаследованные JSX-компоненты (HeadMetricsPanel, HeadDynamicsChart, …)
│
├── supabase/
│   └── migrations/         # SQL-миграции (включая cranial_helmet_transition, enable_rls)
│
├── docs/
│   ├── architecture.md     # Архитектурное описание
│   ├── fix_report.md       # Отчёт фазы fix/broken
│   └── blockers.md         # Известные блокеры
│
└── .github/workflows/
    ├── backend.yml         # ruff lint/format + pytest
    └── frontend.yml        # eslint + tsc + jest + next build
```

## ⚙️ Локальная разработка

### Требования

- Node.js ≥ 18
- Python ≥ 3.12
- Supabase project (URL + Anon Key + Service Role Key)

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

Создайте `backend/.env`:
```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SECRET_KEY=<your-secret>
```

```bash
uvicorn app.main:app --reload
# API: http://localhost:8000
# Swagger: http://localhost:8000/docs
```

```bash
# Тесты
pytest tests/ -q
# Lint
ruff check . && ruff format --check .
```

### 2. Frontend

```bash
cd frontend
npm install
```

Создайте `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
npm run dev          # http://localhost:3000
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript check
npm test             # Jest
npm run build        # Production build
```

## 📦 Деплой

- **Frontend**: Vercel — подключить репозиторий, корневая директория `frontend/`.
- **Backend**: Railway / Render / Docker-совместимый хостинг.
- **Supabase**: применить миграции: `supabase db push` или вручную через Dashboard.

## 📐 Клинические константы

Пороги для оценки деформации определены в `backend/app/core/clinical_defaults.py`:

| Метрика | Норма | Умеренная | Тяжёлая |
|---|---|---|---|
| CVAI | < 3.5 % | 3.5–6.25 % | > 6.25 % |
| CI (Cephalic Index) | 75–85 % | — | < 70 или > 90 % |
| CVA | < 5 мм | 5–10 мм | > 10 мм |

## 🧪 CI

| Воркфлоу | Шаги |
|---|---|
| Backend | ruff lint → ruff format check → pytest |
| Frontend | eslint → tsc --noEmit → jest → next build |