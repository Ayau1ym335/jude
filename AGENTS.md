# AGENTS.md — Jude Cranial Helmet Platform

Инструкции для AI-агентов (Cursor, Copilot, Claude, Gemini, и др.) работающих в этом репозитории.

## Продукт

**Краниальные шлемы-реформеры для младенцев** (не AFO — стопы вырезаны).
API, UI и тесты касаются исключительно работы с головой.

## Стек

| Слой | Технология |
|---|---|
| Backend | FastAPI + Python 3.12 · Trimesh · pygeodesic |
| Frontend | Next.js 15 App Router · TypeScript · Three.js |
| DB/Auth | Supabase (PostgreSQL, Storage, Auth + RLS) |

## Правила работы с кодом

### Backend

- Конфиг → `app/core/config.py` (`Settings`, pydantic-settings).
- БД → `app/core/database.get_supabase()`. **Никогда** не создавай суpabase-клиент вне этой функции.
- Auth → `app/core/auth.get_current_user` / `require_role`. **Никогда** не пропускай защиту эндпоинтов.
- Исключения → `app/core/exceptions.py`. Используй `AppError`, `NotFoundError`, `PermissionError`.
- Клинические константы → `app/core/clinical_defaults.py`. Не хардкодь числа CVAI/CI/CVA в сервисах.
- Все новые роутеры → `app/api/`. В `app/routers/` только compatibility re-exports.
- Каждый новый модуль требует соответствующего теста в `backend/tests/`.
- Линт: `ruff check . && ruff format --check .` должны быть зелёными.
- Тесты: `pytest tests/ -q` должны быть зелёными.

### Frontend

- API-запросы → только через `lib/api.ts`. **Не** пиши `fetch(...)` напрямую в компонентах.
- Новые доменные компоненты → `features/<domain>/`. Общие UI → `components/`.
- Типы → строго, без `any`. При неизвестной схеме — `unknown` или отдельный интерфейс.
- ESLint: `npm run lint` — 0 ошибок.
- TypeScript: `npx tsc --noEmit` — 0 ошибок.

### Общее

- **RLS включён** на всех таблицах — тесты с `service_role` обходят RLS намеренно.
- Миграции → `supabase/migrations/`. Имя файла: `YYYYMMDDHHMMSS_description.sql`.
- Большие бинарные файлы (STL/OBJ/PLY) → `data/` (в `.gitignore`), не в git.
- Ветка `cleanup/structure` содержит все структурные изменения после `fix/broken`.

## Запуск

```bash
# Backend
cd backend && uvicorn app.main:app --reload

# Frontend
cd frontend && npm run dev

# Backend тесты
cd backend && pytest tests/ -q

# Frontend линт + type check
cd frontend && npm run lint && npx tsc --noEmit
```

## Ссылки

- [README.md](../README.md) — общий обзор и быстрый старт
- [docs/architecture.md](../docs/architecture.md) — детальная архитектура
- [docs/fix_report.md](../docs/fix_report.md) — что было сломано и как починено
