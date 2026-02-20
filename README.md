# HARVEST – Coffee Farm Management System

A React-based web application for managing coffee farms, tracking plant growth stages, recording harvest data, and generating decision-support recommendations.

## Features

- **User Authentication** – Registration & login with localStorage persistence
- **Dashboard** – Overview of all farms, clusters, tree counts, and harvest-ready indicators
- **Farm Management** – Create farms, add clusters, and track plant stages (Seed/Sapling → Tree → Flowering → Ready to Harvest)
- **Cluster Detail Tracking** – Dynamic forms capturing stage-specific data (soil pH, temperature, fertilizer, pest monitoring, pre/post-harvest metrics)
- **Harvest Records & Forecast** – Yield comparison charts, grade distribution, and seasonal filtering
- **Decision Support / Recommendations** – Rules-based analysis engine identifying issues (fertilizer, pruning, pests, etc.) and generating actionable recommendations
- **Settings** – Profile management and account controls

## Tech Stack

- **React 19** + **Vite** (JavaScript)
- **react-router-dom** – Client-side routing
- **Recharts** – Bar, Pie, and Line charts
- **Lucide React** – Icon library
- **CSS Custom Properties** – Green-themed design system

## Getting Started

```bash
npm install
npm run dev
```

## ML Model API (Final Trained Models)

The app can use the trained models in `ml_models/` through the FastAPI service in `backend/predict_api.py`.

1. Install backend dependencies:
```bash
py -m pip install -r backend/requirements.txt
```

2. Start the model API:
```bash
py -m uvicorn backend.predict_api:app --reload --host 0.0.0.0 --port 8000
```

3. Point the frontend to the API (optional; default is `http://localhost:8000`):
```bash
VITE_ML_API_URL=http://localhost:8000
```

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
