# IKAPE - Coffee Farm Management and Decision Support

Web application for coffee farm monitoring, yield/quality forecasting, and farmer decision support.

## Features

- Farmer account/profile management
- Farm, cluster, and seasonal harvest tracking
- Coffee yield and quality grade capture (Fine, Premium, Commercial)
- Interactive analytics charts (yield trends, grade distribution, predicted vs actual)
- Decision support recommendations tailored per cluster and farmer context
- Admin analytics and prediction dashboards

## System IPO (Input, Process, Output)

### 1) Farmer Data Capture and Monitoring

Input:
- User profile: username, name, contact, location, age
- Farm profile: farm name, farm size, elevation, overall tree count
- Cluster profile: cluster name, area, plant count, stage, variety
- Stage updates: planting/pruning dates, fertilizer/pesticide info, weather and flood fields, soil pH, shade-tree presence
- Harvest and quality updates: season, harvest date, yield, grade percentages, defects, bean moisture/screen size

Process:
- Form validation in frontend (required fields, numeric ranges)
- Supabase write operations with RLS checks
- Cluster stage snapshots are appended (history-preserving flow)
- Harvest records are inserted as separate time-series records
- Latest records are merged for dashboards and recommendations

Output:
- Updated farm and cluster dashboards
- Historical trend charts (yield, grades, activity)
- Current cluster state + latest quality indicators
- Recommendation context inputs for decision support

### 2) Prediction (Yield + Grade)

Input:
- Model features from user/system data (farm/cluster context, crop management, weather, soil, defect and bean-quality factors)
- API payload:
  - `POST /predict`: `{ "features": { ... } }`
  - `POST /predict/batch`: `{ "samples": [{ "id": "...", "features": { ... } }] }`

Process:
- Feature normalization/mapping in backend (`backend/predict_api.py`)
- Model inference using trained artifacts in `ml_models/`
- Grade triplet normalization to 100%
- Grade interpretation mapping (`dominant_grade`, `grade_label`)

Output:
- Predicted:
  - `yield_kg`
  - `fine_grade_pct`
  - `premium_grade_pct`
  - `commercial_grade_pct`
  - `dominant_grade`
  - `grade_label`
- Displayed in admin prediction tables/cards/charts

### 3) Decision Support

Input:
- Latest stage and harvest values
- PNS-related quality/defect indicators
- Farm/cluster operational context

Process:
- Rule-based checks and standards alignment (including PNS-oriented factors)
- Cluster/farm-level condition evaluation
- Prioritization of interventions based on observed values and trend context

Output:
- Actionable recommendation messages per cluster/farm
- Highlighted risk or compliance flags
- Suggested timing/focus for farm management actions

## Tech Stack

- Frontend: React + Vite + Recharts + Supabase JS
- Backend ML API: FastAPI + scikit-learn
- Storage/Auth: Supabase

## Run Frontend

```bash
npm install
npm run dev
```

## Run Prediction API

```bash
py -m pip install -r backend/requirements.txt
py -m uvicorn backend.predict_api:app --reload --host 0.0.0.0 --port 8000
```

Before running the updated app logic, run the SQL statements in:

- `align_pns_and_history.sql`
- `align_model_features_schema.sql`
- `sync_plant_count_to_stage_data.sql`
- `add_audit_and_append_only_safeguards.sql`

Or run the single consolidated migration instead:

- `full_database_refactor.sql`

`align_model_features_schema.sql` also creates `public.model_features_latest`, a model-ready view
that includes the full feature set (and intentionally excludes cupping score).

`add_audit_and_append_only_safeguards.sql` adds:
- append-only protection for `cluster_stage_data` and `harvest_records`
- audit trail logging for inserts/updates/deletes on farms, clusters, stage, and harvest tables

Optional:

```bash
VITE_ML_API_URL=http://localhost:8000
```

## Synthetic-Only Workflow

Generate synthetic model/dashboards data (single source for both):

```bash
py -m backend.generate_synthetic_data \
  --rows 2400 \
  --seed 42 \
  --output-csv ml_models/coffee_training_data.csv \
  --output-admin-json ml_models/synthetic_admin_data.json
```

Synthetic ID format in generated data:

- `farm_id`: `farm001`, `farm002`, ...
- `cluster_id`: `fm001cl001`, `fm001cl002`, ...

Train models using only synthetic dataset:

```bash
py -m backend.train_models \
  --dataset ml_models/coffee_training_data.csv \
  --model-dir ml_models \
  --min-rows 100 \
  --min-yield-r2 0.70 \
  --min-grade-r2 0.65
```

Run backend in synthetic mode:

```bash
$env:DATA_MODE="synthetic"
py -m uvicorn backend.predict_api:app --reload --host 0.0.0.0 --port 8000
```

Run frontend in synthetic mode (admin dashboards + prediction page):

```bash
$env:VITE_DATA_MODE="synthetic"
$env:VITE_ML_API_URL="http://localhost:8000"
npm run dev
```

## Reproducible Model Training

Export a training CSV from Supabase first:

```bash
py -m backend.export_training_dataset --output ml_models/coffee_training_data.csv
```

Then train from CSV with deterministic split/search settings, dataset QA checks, CV model selection, and saved metrics:

```bash
py -m backend.train_models --dataset ml_models/coffee_training_data.csv
```

Optional flags:

```bash
py -m backend.train_models \
  --dataset path/to/coffee_training_data.csv \
  --model-dir ml_models \
  --test-size 0.2 \
  --cv-splits 5 \
  --search-iter 16 \
  --quick-train \
  --random-state 42 \
  --min-rows 200 \
  --min-yield-r2 0.70 \
  --min-grade-r2 0.65
```

### Training Outputs

- `ml_models/trained_yield_model_RF.joblib`
- `ml_models/trained_grade_model_fine_grade_pct.joblib`
- `ml_models/trained_grade_model_premium_grade_pct.joblib`
- `ml_models/trained_grade_model_commercial_grade_pct.joblib`
- `ml_models/model_metadata.json`

`model_metadata.json` includes:

- dataset quality checks (missingness, duplicates, cleaned row count)
- candidate-model comparison and selected algorithm per target
- CV RMSE and holdout test metrics (RMSE, MAE, R2)
- feature statistics and metric formulas
- quality gates used to block low-accuracy model publication

## Dataset Requirements (Canonical Columns)

Feature columns:

- Identity and farm/cluster context:
  - `farm_id`, `cluster_id`, `farm_size_ha`, `elevation_m`
  - `farm_cluster_count`, `cluster_plant_share_pct`, `cluster_tree_density_per_sqm`
- Crop/management:
  - `plant_age_years`, `number_of_plants`
  - `fertilizer_type`, `fertilizer_frequency`, `pesticide_type`, `pesticide_frequency`
  - `pruning_interval_months`, `shade_tree_present`
- Weather and site:
  - `soil_ph`, `avg_temp_c`, `avg_rainfall_mm`, `avg_humidity_pct`
  - `flood_risk_level`, `flood_events_count`
- Historical production:
  - `pre_total_trees`, `pre_yield_kg`, `pre_grade_fine`, `pre_grade_premium`, `pre_grade_commercial`
  - `previous_fine_pct`, `previous_premium_pct`, `previous_commercial_pct`
- Post-harvest quality/PNS factors:
  - `bean_size_mm`, `bean_screen_size`, `bean_moisture`
  - `defect_black_pct`, `defect_mold_infested_pct`, `defect_immature_pct`
  - `defect_broken_pct`, `defect_dried_cherries_pct`, `defect_foreign_matter_pct`
  - `pns_total_defects_pct`

Target columns:

- `yield_kg`, `fine_grade_pct`, `premium_grade_pct`, `commercial_grade_pct`

Notes:

- The trainer supports common aliases and normalizes columns.
- Invalid categorical values are converted to null and imputed in the pipeline.
- Grade targets are normalized to sum to 100 per row when available.
- Cupping score is intentionally excluded from this predictive feature set.

## Model Metadata API

- `GET /health` returns service status and training timestamp (if metadata exists)
- `GET /model/metadata` returns full training/evaluation metadata for auditability
- `POST /predict` single prediction (includes `dominant_grade` and `grade_label`)
- `POST /predict/batch` batch prediction
