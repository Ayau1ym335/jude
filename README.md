# Helmet Platform (Cranial Remolding Orthosis)

Полнофункциональное веб-приложение для ортопедических клиник и производителей краниальных шлемов. Управление пациентами, валидация и обработка 3D-сканов головы (STL, OBJ, PLY), проектирование шлемов-реформеров.

## 🚀 Ключевые возможности

- **Управление пациентами и проектами**: сквозной флоу от создания карточки пациента до загрузки скана и отслеживания проекта шлема.
- **Валидация 3D-скана головы**: автоматический бэкенд-пайплайн — проверка manifoldness, watertightness и физических размеров модели.
- **Автоматическая децимация**: фоновые задачи (FastAPI) сокращают высокополигональные сканы до оптимизированных превью (< 50 000 граней) для быстрого WebGL-рендера.
- **Высокопроизводительный 3D-viewer**: WebGL на Three.js. Поддержка STL, OBJ, PLY. Динамический зум, авто-центрирование, оптимизация FPS.
- **Геодезические кривые (trim-линии шлема)**: разметка линий обрезки — вырезы под уши, передний проём, нижний край. Строятся по поверхности скана через алгоритм Кимелла-Сетяна.
- **Локальная коррекция объёма**: ядро проектирования шлема. В плоских зонах добавляется объём (зазор для роста), в выступающих убирается (снятие давления). Инструмент «добавить/убрать объём» с геодезическим затуханием.
- **Версионирование правок**: каждая коррекция сохраняется как новая версия проекта.
- **Экспорт STL**: для передачи в производство.
- **Безопасная архитектура**: Supabase (PostgreSQL + Auth), JWT-аутентификация.

> **Инверсия слепка не нужна** — для шлемов голова сканируется напрямую.

## 🛠 Стек

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript, React
- **Styling**: Tailwind CSS (glassmorphism UI, dark mode)
- **3D Rendering**: Three.js (raw integration)

### Backend
- **Framework**: FastAPI
- **Language**: Python 3
- **Geometry**: Trimesh + pygeodesic (алгоритм Кимелла-Сетяна)
- **Database & Storage**: Supabase (PostgreSQL, Storage, Auth)

## 📁 Структура проекта

```text
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── dependencies/     # Auth and DB dependencies
│   │   ├── geometry/         # Trimesh processing, validation, decimation
│   │   ├── routers/          # API endpoints (patients, projects, scans, geometry, trim-lines)
│   │   ├── schemas/          # Pydantic models (ScanCreate, ProjectCreate с helmet_type)
│   │   └── services/         # Supabase client
│   └── services/
│       ├── local_smoothing.py   # Локальная коррекция объёма (геодезические веса)
│       ├── versioning.py        # Сохранение версий mesh
│       └── mesh_loader.py       # Загрузка mesh из Supabase Storage
│
├── frontend/                 # Next.js Application
│   ├── app/                  # App Router pages (dashboard, patients, upload)
│   ├── components/           # React components
│   │   ├── ModelViewer.tsx      # 3D viewer (Three.js)
│   │   ├── TrimLinesPanel.tsx   # Панель trim-линий шлема
│   │   ├── TrimLineDrawer.tsx   # Canvas overlay для рисования кривых
│   │   └── SmoothingTool.tsx    # Инструмент коррекции объёма
│   └── package.json
```

## ⚙️ Локальная разработка

### Требования
- Node.js (v18+)
- Python (v3.10+)
- Supabase Project (URL & Anon Key)

### 1. Supabase
Таблицы в БД:
- `patients`
- `scans` (поле `scan_source`: patient_direct / structured_light / photogrammetry)
- `projects` (поле `helmet_type`: cranial_remolding)
- `project_versions`
- `trim_lines`
- Storage Bucket: `scan-files`

### 2. Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```
`.env.local` в `backend/`:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
```bash
uvicorn app.main:app --reload
```
API: `http://localhost:8000` | Swagger: `http://localhost:8000/docs`

### 3. Frontend
```bash
cd frontend
npm install
```
`.env.local` в `frontend/`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```
```bash
npm run dev
```
App: `http://localhost:3000`

## 📦 Деплой
- **Frontend**: Vercel (подключить репозиторий, деплоить директорию `frontend/`).
- **Backend**: Railway, Render или любой Docker-совместимый хостинг.