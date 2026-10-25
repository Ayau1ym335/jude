# Отчёт об уборке: `cleanup/structure`

Ветка: `cleanup/structure`  
Предусловие: `fix/broken` смержен, приложение запускалось, дымовые тесты проходили.  
Тег до начала работ: `before-cleanup`

---

## Итоговое состояние

| Проверка | Результат |
|---|---|
| `pytest tests/ -q` | **68 passed**, 8 warnings (Pydantic V2 deprecation, pre-existing) |
| `npm test -- --watchAll=false` | **32 passed**, 0 failed |
| `npm run lint` | **0 errors**, 8 warnings (unused vars в унаследованных JSX и тестах) |
| `npx tsc --noEmit` | **0 errors** |
| `ruff check .` | **All checks passed** |
| `ruff format --check .` | **All checks passed** |

---

## Шаги

### Шаг 1 — Git-гигиена (b5da439)

- Обновлён `.gitignore`: добавлены `node_modules/`, `__pycache__/`, `*.pyc`, `.next/`, `supabase/.temp/`, `*.stl`, `*.obj`, `*.ply`, `.env*`, `data/`.
- Убрана директория `supabase/.temp/` из git-индекса.
- Тяжёлые STL-файлы перемещены в `data/` (вне git).
- Добавлена тестовая фикстура: `backend/tests/fixtures/head_icosphere_sample.stl`.

### Шаг 2 — Удаление AFO и переход на краниальные шлемы (6f0a60e)

- Удалены AFO-скрипты синтетических тестов и отчёты.
- Добавлена миграция `20261026000000_cranial_helmet_transition.sql` (колонка `product_type`, расширенные типы trim_lines).
- Обновлены Pydantic-схемы, роутеры, seed-скрипты и UI-тексты — терминология «шлем» вместо «AFO».

### Шаг 3 — Реструктуризация бэкенда (873841a)

- Созданы core-модули: `app/core/config.py`, `database.py`, `auth.py`, `exceptions.py`, `clinical_defaults.py`.
- Объединён `app/services/mesh_loader.py`.
- Роутеры перемещены в `app/api/`; `app/routers/` — compatibility re-exports.
- Все 64 теста прошли после рефакторинга.

### Шаг 4 — Реструктуризация фронтенда (ae6691f)

- Компоненты организованы в `frontend/features/` (patients/, viewer/, trim-lines/, metrics/).
- Централизованный API-клиент: `frontend/lib/api.ts`.
- Удалены неиспользуемые статические шрифты и дефолтные SVG Next.js.
- 32 теста прошли; `npm run build` успешен.

### Шаг 5 — RLS и клинические константы (fea1ff6)

- Проверены RLS-политики на всех таблицах.
- Добавлена миграция `20261026000100_enable_rls_all_tables.sql`.
- Добавлены автоматические RLS-тесты: `backend/tests/test_rls.py`.
- Клинические константы централизованы в `app/core/clinical_defaults.py` и импортированы из сервисов.

### Шаг 6 — Качество кода и CI (72ef911)

- `lib/api.ts`: заменены все `any` на строгие интерфейсы (`ScanRead`, `HeadMetricsRead`, `MeasurementRead`, и т.д.).
- `components/HeadMetricsPanel.tsx`: аналогично, `any` → `MeasurementRead`.
- `src/components/HeadDynamicsChart.jsx`, `HeadMetricsPanel.jsx`: добавлены `eslint-disable-next-line react-hooks/set-state-in-effect` для намеренных fire-and-forget паттернов.
- Обновлены CI-воркфлоу:
  - `.github/workflows/backend.yml`: ruff lint → ruff format check → pytest
  - `.github/workflows/frontend.yml`: eslint → tsc --noEmit → jest → next build
- **Итог**: ESLint — 0 ошибок; `tsc --noEmit` — 0 ошибок; ruff — чисто.

### Шаг 7 — Документация (b6e4fe2)

- `README.md` полностью переписан: краниальные шлемы, реальная структура папок, таблица стека, CI, клинические пороги.
- `docs/architecture.md`: детальное описание бэкенда, фронтенда, геометрического пайплайна, схемы БД, миграций.
- `AGENTS.md` (корень): унифицированный гайд для AI-агентов (правила, запуск, ссылки).

### Шаг 8 — Финальная верификация и отчёт (этот коммит)

- `app/services/head_metrics.py`: добавлены re-export алиасы `CI_TENTATIVE_REFERENCE`, `CVAI_TENTATIVE_REFERENCE` (backward compatibility для тестов, которые импортируют из модуля сервиса).
- Все 68 backend-тестов прошли.
- Все 32 frontend-теста прошли.

---

## Что НЕ трогалось

| Область | Причина |
|---|---|
| Поведение API (эндпоинты, контракты) | Только структура, не поведение |
| `src/components/*.jsx` (логика) | Только lint-комментарии, не рефакторинг |
| `supabase/migrations/` (существующие) | Не удалялись и не изменялись |
| Бинарные данные (STL, OBJ) | Перемещены в `data/` без удаления из гит-истории |
| Pydantic class-based Config | Pre-existing warning, миграция на ConfigDict — отдельная задача |

---

## Известные ограничения

- `test_rls.py` требует живого Supabase (`service_role` key) → исключён из CI-пайплайна.
- Pydantic V2 deprecation warnings (`class Config`) — в `app/schemas/` — не критично, но потребует отдельного PR.
- `src/components/*.jsx` имеют 4 `no-unused-vars` warning — рефакторинг JSX в TypeScript вынесен за рамки текущей задачи.
