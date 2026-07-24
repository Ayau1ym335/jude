# AFO Platform (Orthotics Platform)

A full-stack web application for orthotic clinics and manufacturers to manage patients, validate and process 3D anatomical scans (STL, OBJ, PLY), and oversee manufacturing projects (e.g., Ankle-Foot Orthoses - AFO).

## 🚀 Key Features

- **Patient & Project Management**: End-to-end flow from patient creation to scan uploading and project tracking.
- **3D Scan Validation**: Automated backend pipeline that checks 3D models for manifoldness, watertightness, and bounding box physical limits.
- **Automated Mesh Decimation**: Background tasks (via FastAPI) automatically reduce high-poly 3D scans to optimized preview meshes (< 50,000 faces) for fast web rendering, preserving the original clinical file for manufacturing.
- **High-Performance 3D Viewer**: WebGL-powered 3D viewer built with Three.js. Supports STL, OBJ, and PLY formats. Includes dynamic zooming, auto-centering, and frame-rate optimizations (e.g., pixel ratio capping, normal memoization).
- **Secure Architecture**: Integrated with Supabase (PostgreSQL + Auth) using JWT-based authentication across the frontend and backend.

## 🛠 Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript, React
- **Styling**: Tailwind CSS (with glassmorphism UI & dark mode support)
- **3D Rendering**: Three.js (raw integration for maximum performance control)

### Backend
- **Framework**: FastAPI
- **Language**: Python 3
- **Geometry Processing**: Trimesh (for mesh validation and decimation)
- **Database & Storage**: Supabase (PostgreSQL, Storage, Auth)

## 📁 Project Structure

```text
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── dependencies/     # Auth and DB dependencies
│   │   ├── geometry/         # Trimesh processing, validation, and decimation
│   │   ├── routers/          # API endpoints (patients, projects, scans, upload)
│   │   ├── schemas/          # Pydantic models for validation
│   │   └── services/         # Supabase client integration
│   └── requirements.txt      # Python dependencies
│
├── frontend/                 # Next.js Application
│   ├── app/                  # App Router pages (dashboard, patients, projects, upload)
│   ├── components/           # React components (AppLayout, ModelViewer, etc.)
│   ├── lib/                  # Utilities (Supabase client)
│   └── package.json          # Node dependencies
```

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- A Supabase Project (URL & Anon Key)

### 1. Supabase Configuration
Ensure your Supabase project has the following tables configured (e.g., via SQL Editor):
- `patients`
- `scans` (with `validation_status` column)
- `projects`
- Storage Bucket named `scan-files`.

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# Activate virtual environment (Windows: .venv\Scripts\activate | Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
```
Create a `.env.local` file in the `backend/` directory:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
Run the FastAPI server:
```bash
poetry run uvicorn app.main:app --reload
# or using standard python:
uvicorn app.main:app --reload
```
API runs on `http://localhost:8000`. Swagger docs available at `http://localhost:8000/docs`.

### 3. Frontend Setup
```bash
cd frontend
npm install
```
Create a `.env.local` file in the `frontend/` directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```
Run the Next.js development server:
```bash
npm run dev
```
App runs on `http://localhost:3000`.

## 📦 Deployment
- **Frontend**: Optimized for Vercel. Connect the GitHub repo and deploy the `frontend/` directory.
- **Backend**: Can be deployed to Railway, Render, or any Docker-compatible hosting. Ensure `runtime.txt` is present if using Python buildpacks.