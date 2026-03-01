from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend.modeling import FEATURE_KEYS, TARGET_KEYS


DEFAULT_OUTPUT = os.path.abspath(
    os.getenv("ML_DATASET_OUTPUT", os.path.join(os.path.dirname(__file__), "..", "ml_models", "coffee_training_data.csv"))
)


FEATURE_COLUMNS = FEATURE_KEYS
TARGET_COLUMNS = TARGET_KEYS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export model training dataset from Supabase tables."
    )
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help=f"Output CSV path (default: {DEFAULT_OUTPUT})")
    parser.add_argument("--max-rows", type=int, default=20000, help="Maximum rows to export (default: 20000)")
    return parser.parse_args()


def load_local_env() -> Dict[str, str]:
    env_values: Dict[str, str] = {}
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(env_path):
        return env_values

    with open(env_path, "r", encoding="utf-8") as file:
        for raw_line in file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env_values[key.strip()] = value.strip()
    return env_values


def get_env_value(key: str, fallback: Optional[str] = None) -> Optional[str]:
    return os.getenv(key) or load_local_env().get(key) or fallback


def to_number(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def months_between(start_date: Optional[str], end_date: datetime) -> Optional[float]:
    if not start_date:
        return None
    try:
        date_value = datetime.fromisoformat(str(start_date).replace("Z", "+00:00"))
    except ValueError:
        try:
            date_value = datetime.strptime(str(start_date), "%Y-%m-%d")
        except ValueError:
            return None
    days = (end_date.date() - date_value.date()).days
    if days < 0:
        return 0.0
    return round(days / 30.4375, 3)


def years_between(start_date: Optional[str], end_date: datetime) -> Optional[float]:
    months = months_between(start_date, end_date)
    if months is None:
        return None
    return round(months / 12.0, 4)


def normalize_type(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", "-").replace(" ", "-")
    if text in ("organic",):
        return "organic"
    if text in ("non-organic", "nonorganic"):
        return "non-organic"
    return ""


def normalize_frequency(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text.startswith("often"):
        return "often"
    if text.startswith("sometimes"):
        return "sometimes"
    if text.startswith("rarely"):
        return "rarely"
    if text.startswith("never"):
        return "never"
    return ""


def normalize_shade(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in ("yes", "true", "1"):
        return "yes"
    if text in ("no", "false", "0"):
        return "no"
    return ""


def normalize_flood_risk(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", "-").replace(" ", "-")
    if text in ("none", "low", "medium", "high", "severe"):
        return text
    return ""


def normalize_screen_size(screen_value: Any, bean_size_mm: Optional[float]) -> str:
    text = str(screen_value or "").strip().lower().replace("_", "-").replace(" ", "-")
    if text in ("extra-small", "small", "medium", "large", "extra-large"):
        return text

    if bean_size_mm is None:
        return ""
    if bean_size_mm >= 7.5:
        return "extra-large"
    if bean_size_mm >= 7.0:
        return "large"
    if bean_size_mm >= 6.5:
        return "medium"
    if bean_size_mm >= 6.0:
        return "small"
    return "extra-small"


def fetch_supabase_rows(
    base_url: str,
    api_key: str,
    table: str,
    select_expr: str,
    max_rows: int,
    order_by: str = "updated_at.desc",
) -> List[Dict[str, Any]]:
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    rows: List[Dict[str, Any]] = []
    page_size = 1000
    offset = 0

    while offset < max_rows:
        query = urlencode(
            {
                "select": select_expr,
                "order": order_by,
                "limit": min(page_size, max_rows - offset),
                "offset": offset,
            }
        )
        url = f"{base_url}/rest/v1/{table}?{query}"
        request = Request(url, headers=headers, method="GET")
        with urlopen(request, timeout=30) as response:
            payload = response.read().decode("utf-8")
            chunk = json.loads(payload)
            if not isinstance(chunk, list) or not chunk:
                break
            rows.extend(chunk)
            if len(chunk) < page_size:
                break
        offset += len(chunk)

    return rows


def build_latest_harvest_by_cluster(harvest_rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    latest: Dict[str, Dict[str, Any]] = {}
    for row in harvest_rows:
        cluster_id = row.get("cluster_id")
        if not cluster_id:
            continue
        cluster_key = str(cluster_id)
        if cluster_key not in latest:
            latest[cluster_key] = row
    return latest


def build_farm_aggregate(stage_rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    latest_cluster_rows: Dict[str, Dict[str, Any]] = {}
    for row in stage_rows:
        cluster_id = row.get("cluster_id")
        if not cluster_id:
            continue
        cluster_key = str(cluster_id)
        if cluster_key not in latest_cluster_rows:
            latest_cluster_rows[cluster_key] = row

    aggregates: Dict[str, Dict[str, float]] = {}
    for row in latest_cluster_rows.values():
        cluster = row.get("clusters") or {}
        farm = cluster.get("farms") or {}
        farm_id = cluster.get("farm_id") or farm.get("id")
        if not farm_id:
            continue

        farm_key = str(farm_id)
        entry = aggregates.setdefault(
            farm_key,
            {
                "cluster_count": 0.0,
                "total_plants": 0.0,
            },
        )
        plants = to_number(row.get("number_of_plants")) or to_number(cluster.get("plant_count")) or 0.0
        entry["cluster_count"] += 1
        entry["total_plants"] += plants

    return aggregates


def build_dataset_rows(
    stage_rows: List[Dict[str, Any]],
    latest_harvest_by_cluster: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    farm_aggregate = build_farm_aggregate(stage_rows)
    dataset: List[Dict[str, Any]] = []

    for row in stage_rows:
        cluster = row.get("clusters") or {}
        farm = cluster.get("farms") or {}
        farm_id = cluster.get("farm_id") or farm.get("id")
        cluster_id = row.get("cluster_id")
        farm_stats = farm_aggregate.get(str(farm_id), {})

        number_of_plants = to_number(row.get("number_of_plants")) or to_number(cluster.get("plant_count"))
        plant_age_years = years_between(row.get("date_planted"), now)
        pruning_interval_months = months_between(row.get("last_pruned_date"), now)
        latest_harvest = latest_harvest_by_cluster.get(str(cluster_id))
        cluster_area_sqm = to_number(cluster.get("area_size_sqm")) or to_number(cluster.get("area_size"))
        farm_total_plants = to_number((farm or {}).get("overall_tree_count")) or farm_stats.get("total_plants")
        bean_size_mm = to_number(row.get("bean_size_mm"))

        record = {
            "farm_id": str(farm_id or ""),
            "cluster_id": str(cluster_id or ""),
            "farm_size_ha": to_number(farm.get("farm_area")),
            "elevation_m": to_number(farm.get("elevation_m") or farm.get("elevation")),
            "farm_cluster_count": farm_stats.get("cluster_count"),
            "cluster_plant_share_pct": (
                (number_of_plants / farm_total_plants) * 100.0
                if number_of_plants and farm_total_plants and farm_total_plants > 0
                else None
            ),
            "cluster_tree_density_per_sqm": (
                number_of_plants / cluster_area_sqm
                if number_of_plants and cluster_area_sqm and cluster_area_sqm > 0
                else None
            ),
            "plant_age_years": plant_age_years,
            "number_of_plants": number_of_plants,
            "fertilizer_type": normalize_type(row.get("fertilizer_type")),
            "fertilizer_frequency": normalize_frequency(row.get("fertilizer_frequency")),
            "pesticide_type": normalize_type(row.get("pesticide_type")),
            "pesticide_frequency": normalize_frequency(row.get("pesticide_frequency")),
            "pruning_interval_months": pruning_interval_months,
            "shade_tree_present": normalize_shade(row.get("shade_tree_present")),
            "soil_ph": to_number(row.get("soil_ph")),
            "avg_temp_c": to_number(row.get("avg_temp_c")),
            "avg_rainfall_mm": to_number(row.get("avg_rainfall_mm")),
            "avg_humidity_pct": to_number(row.get("avg_humidity_pct")),
            "flood_risk_level": normalize_flood_risk(row.get("flood_risk_level")),
            "flood_events_count": to_number(row.get("flood_events_count")),
            "pre_total_trees": to_number(row.get("pre_total_trees")),
            "pre_yield_kg": to_number(row.get("pre_yield_kg")),
            "pre_grade_fine": to_number(row.get("pre_grade_fine")),
            "pre_grade_premium": to_number(row.get("pre_grade_premium")),
            "pre_grade_commercial": to_number(row.get("pre_grade_commercial")),
            "previous_fine_pct": to_number(row.get("previous_fine_pct")),
            "previous_premium_pct": to_number(row.get("previous_premium_pct")),
            "previous_commercial_pct": to_number(row.get("previous_commercial_pct")),
            "bean_size_mm": bean_size_mm,
            "bean_screen_size": normalize_screen_size(row.get("bean_screen_size"), bean_size_mm),
            "bean_moisture": to_number(row.get("bean_moisture")),
            "defect_black_pct": to_number(row.get("defect_black_pct")),
            "defect_mold_infested_pct": to_number(row.get("defect_mold_infested_pct")),
            "defect_immature_pct": to_number(row.get("defect_immature_pct")),
            "defect_broken_pct": to_number(row.get("defect_broken_pct")),
            "defect_dried_cherries_pct": to_number(row.get("defect_dried_cherries_pct")),
            "defect_foreign_matter_pct": to_number(row.get("defect_foreign_matter_pct")),
            "pns_total_defects_pct": to_number(row.get("pns_total_defects_pct")),
            "yield_kg": (
                to_number(row.get("post_current_yield"))
                or to_number(row.get("current_yield"))
                or to_number((latest_harvest or {}).get("yield_kg"))
            ),
            "fine_grade_pct": (
                to_number(row.get("post_grade_fine"))
                or to_number(row.get("previous_fine_pct"))
                or to_number((latest_harvest or {}).get("grade_fine"))
            ),
            "premium_grade_pct": (
                to_number(row.get("post_grade_premium"))
                or to_number(row.get("previous_premium_pct"))
                or to_number((latest_harvest or {}).get("grade_premium"))
            ),
            "commercial_grade_pct": (
                to_number(row.get("post_grade_commercial"))
                or to_number(row.get("previous_commercial_pct"))
                or to_number((latest_harvest or {}).get("grade_commercial"))
            ),
        }

        if all(record[target] is None for target in TARGET_COLUMNS):
            continue
        dataset.append(record)

    return dataset


def write_csv(output_path: str, rows: List[Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    columns = FEATURE_COLUMNS + TARGET_COLUMNS
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in columns})


def main() -> None:
    args = parse_args()

    supabase_url = get_env_value("SUPABASE_URL") or get_env_value("VITE_SUPABASE_URL")
    api_key = (
        get_env_value("SUPABASE_SERVICE_ROLE_KEY")
        or get_env_value("SUPABASE_ANON_KEY")
        or get_env_value("VITE_SUPABASE_ANON_KEY")
    )

    if not supabase_url or not api_key:
        raise RuntimeError(
            "Missing Supabase connection settings. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "(or fallback VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY)."
        )

    stage_rows = fetch_supabase_rows(
        base_url=supabase_url.rstrip("/"),
        api_key=api_key,
        table="cluster_stage_data",
        select_expr="*,clusters(farm_id,area_size_sqm,plant_count,variety,plant_stage,farms(id,farm_area,elevation_m,overall_tree_count))",
        max_rows=args.max_rows,
        order_by="updated_at.desc",
    )
    harvest_rows = fetch_supabase_rows(
        base_url=supabase_url.rstrip("/"),
        api_key=api_key,
        table="harvest_records",
        select_expr="cluster_id,season,yield_kg,grade_fine,grade_premium,grade_commercial,recorded_at",
        max_rows=args.max_rows,
        order_by="recorded_at.desc",
    )

    latest_harvest_by_cluster = build_latest_harvest_by_cluster(harvest_rows)
    dataset_rows = build_dataset_rows(stage_rows, latest_harvest_by_cluster)
    if not dataset_rows:
        raise RuntimeError(
            "No training rows exported. Check RLS permissions and ensure stage-data rows include target values."
        )

    write_csv(args.output, dataset_rows)
    print(f"Exported {len(dataset_rows)} rows to {os.path.abspath(args.output)}")


if __name__ == "__main__":
    main()
