from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

import numpy as np

from backend.modeling import FEATURE_KEYS, TARGET_KEYS


DEFAULT_ROWS = 2400
DEFAULT_OUTPUT_CSV = os.path.abspath(
    os.getenv("ML_DATASET_OUTPUT", os.path.join(os.path.dirname(__file__), "..", "ml_models", "coffee_training_data.csv"))
)
DEFAULT_OUTPUT_ADMIN_JSON = os.path.abspath(
    os.getenv("SYNTHETIC_ADMIN_DATA_PATH", os.path.join(os.path.dirname(__file__), "..", "ml_models", "synthetic_admin_data.json"))
)

SEASON_DEFS = [
    ("2023 Dry", "dry", datetime(2023, 4, 10, tzinfo=timezone.utc)),
    ("2023 Wet", "wet", datetime(2023, 10, 10, tzinfo=timezone.utc)),
    ("2024 Dry", "dry", datetime(2024, 4, 10, tzinfo=timezone.utc)),
    ("2024 Wet", "wet", datetime(2024, 10, 10, tzinfo=timezone.utc)),
    ("2025 Dry", "dry", datetime(2025, 4, 10, tzinfo=timezone.utc)),
    ("2025 Wet", "wet", datetime(2025, 10, 10, tzinfo=timezone.utc)),
]


@dataclass
class FarmProfile:
    id: str
    user_id: str
    first_name: str
    last_name: str
    farm_name: str
    farm_area: float
    elevation_m: float
    overall_tree_count: int


@dataclass
class ClusterProfile:
    id: str
    farm_id: str
    cluster_name: str
    area_size_sqm: float
    plant_count: int
    created_at: datetime
    base_age_years: float
    soil_ph_base: float
    variety: str
    shade_tree_present: str
    fertilizer_type: str
    pesticide_type: str
    management_level: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic IKAPE dataset for model training and dashboard integration."
    )
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS, help=f"Approximate target rows (default: {DEFAULT_ROWS})")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible synthetic data.")
    parser.add_argument("--output-csv", default=DEFAULT_OUTPUT_CSV, help=f"Synthetic training CSV path (default: {DEFAULT_OUTPUT_CSV})")
    parser.add_argument(
        "--output-admin-json",
        default=DEFAULT_OUTPUT_ADMIN_JSON,
        help=f"Synthetic admin/dashboard JSON path (default: {DEFAULT_OUTPUT_ADMIN_JSON})",
    )
    return parser.parse_args()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def smooth_peak(value: float, center: float, spread: float) -> float:
    if spread <= 0:
        return 0.0
    return math.exp(-((value - center) ** 2) / (2 * spread * spread))


def pick_frequency(score: float) -> str:
    if score >= 0.85:
        return "often"
    if score >= 0.62:
        return "sometimes"
    if score >= 0.42:
        return "rarely"
    return "never"


def frequency_factor(freq: str) -> float:
    return {"never": 0.84, "rarely": 0.93, "sometimes": 1.02, "often": 1.1}.get(freq, 1.0)


def type_factor(value: str) -> float:
    return {"organic": 1.0, "non-organic": 1.03}.get(value, 1.0)


def shade_factor(value: str) -> float:
    return {"yes": 1.02, "no": 0.97}.get(value, 1.0)


def infer_screen_size(bean_size_mm: float) -> str:
    if bean_size_mm >= 7.5:
        return "extra-large"
    if bean_size_mm >= 7.0:
        return "large"
    if bean_size_mm >= 6.5:
        return "medium"
    if bean_size_mm >= 6.0:
        return "small"
    return "extra-small"


def generate_farms_and_clusters(target_rows: int, rng: random.Random) -> Tuple[List[FarmProfile], List[ClusterProfile]]:
    season_count = len(SEASON_DEFS)
    cluster_target = max(40, math.ceil(target_rows / season_count))
    farm_count = max(12, math.ceil(cluster_target / 8))
    farm_id_width = max(3, len(str(farm_count)))

    first_names = ["Aira", "Lito", "Maya", "Jon", "Elena", "Carlo", "Nina", "Rico", "Ana", "Paolo"]
    last_names = ["Santos", "Reyes", "Dela Cruz", "Bautista", "Mendoza", "Garcia", "Ramos", "Torres"]

    farms: List[FarmProfile] = []
    clusters: List[ClusterProfile] = []
    per_farm_cluster_counts: List[int] = []

    # Allocate exact cluster count across farms to honor requested row target.
    remaining_clusters = cluster_target
    for idx in range(farm_count):
        farms_left = farm_count - idx
        min_per_farm = 4
        max_per_farm = 12
        min_for_this = max(min_per_farm, remaining_clusters - (farms_left - 1) * max_per_farm)
        max_for_this = min(max_per_farm, remaining_clusters - (farms_left - 1) * min_per_farm)
        if min_for_this > max_for_this:
            min_for_this = max_for_this
        sampled = int(round(rng.triangular(min_for_this, max_for_this, (min_for_this + max_for_this) / 2)))
        cluster_count = int(clamp(sampled, min_for_this, max_for_this))
        per_farm_cluster_counts.append(cluster_count)
        remaining_clusters -= cluster_count

    for i in range(farm_count):
        farm_no = i + 1
        user_id = f"user{farm_no:0{farm_id_width}d}"
        farm_id = f"farm{farm_no:0{farm_id_width}d}"
        first_name = rng.choice(first_names)
        last_name = rng.choice(last_names)
        farm_area = round(rng.uniform(3.0, 42.0), 2)
        # Robusta-focused elevation: mostly low to mid elevation, with natural spread.
        elevation = round(rng.triangular(180.0, 950.0, 560.0), 1)
        cluster_count = per_farm_cluster_counts[i]

        farms.append(
            FarmProfile(
                id=farm_id,
                user_id=user_id,
                first_name=first_name,
                last_name=last_name,
                farm_name=f"{last_name} Robusta Farm {farm_no:03d}",
                farm_area=farm_area,
                elevation_m=elevation,
                overall_tree_count=0,
            )
        )

        for j in range(cluster_count):
            cluster_no = j + 1
            area_sqm = round(rng.uniform(1100, 7200), 2)
            plant_density = rng.uniform(0.04, 0.1)
            plant_count = max(90, int(round(area_sqm * plant_density)))
            base_age = rng.uniform(2.5, 14.0)
            soil_ph = rng.uniform(5.2, 6.8)
            management_level = rng.uniform(0.35, 0.95)

            clusters.append(
                ClusterProfile(
                    id=f"fm{farm_no:0{farm_id_width}d}cl{cluster_no:03d}",
                    farm_id=farm_id,
                    cluster_name=f"Cluster {chr(65 + (j % 26))}-{j + 1}",
                    area_size_sqm=area_sqm,
                    plant_count=plant_count,
                    created_at=datetime(2021, 1, 1, tzinfo=timezone.utc) + timedelta(days=rng.randint(0, 730)),
                    base_age_years=base_age,
                    soil_ph_base=soil_ph,
                    variety="Robusta" if rng.random() < 0.9 else rng.choice(["Arabica", "Liberica", "Excelsa"]),
                    shade_tree_present="yes" if rng.random() < 0.65 else "no",
                    fertilizer_type="non-organic" if rng.random() < 0.55 else "organic",
                    pesticide_type="non-organic" if rng.random() < 0.6 else "organic",
                    management_level=management_level,
                )
            )

    farm_totals: Dict[str, int] = {}
    for cluster in clusters:
        farm_totals[cluster.farm_id] = farm_totals.get(cluster.farm_id, 0) + cluster.plant_count

    farms_by_id = {farm.id: farm for farm in farms}
    for farm_id, total in farm_totals.items():
        farm = farms_by_id.get(farm_id)
        if farm:
            farm.overall_tree_count = total

    farms = [farm for farm in farms if farm.overall_tree_count > 0]
    return farms, clusters


def generate_synthetic_records(
    farms: List[FarmProfile],
    clusters: List[ClusterProfile],
    rng: random.Random,
) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    np_rng = np.random.default_rng(rng.randint(1, 10_000_000))
    farms_by_id = {farm.id: farm for farm in farms}
    cluster_count_by_farm: Dict[str, int] = {}
    for c in clusters:
        cluster_count_by_farm[c.farm_id] = cluster_count_by_farm.get(c.farm_id, 0) + 1

    dataset_rows: List[Dict[str, Any]] = []
    latest_stage_by_cluster: Dict[str, Dict[str, Any]] = {}
    harvest_records: List[Dict[str, Any]] = []

    for cluster in clusters:
        farm = farms_by_id[cluster.farm_id]
        farm_cluster_count = cluster_count_by_farm[cluster.farm_id]
        cluster_plant_share_pct = (cluster.plant_count / max(farm.overall_tree_count, 1)) * 100.0
        cluster_tree_density = cluster.plant_count / max(cluster.area_size_sqm, 1.0)

        prev_yield = rng.uniform(30, 110)
        prev_fine = rng.uniform(9, 20)
        prev_premium = rng.uniform(24, 38)
        prev_commercial = max(100 - prev_fine - prev_premium, 35)

        for season_index, (season_name, season_type, recorded_at) in enumerate(SEASON_DEFS):
            temp = rng.uniform(24.0, 29.5) if season_type == "dry" else rng.uniform(21.0, 26.0)
            rainfall = rng.uniform(90, 190) if season_type == "dry" else rng.uniform(190, 340)
            humidity = rng.uniform(60, 76) if season_type == "dry" else rng.uniform(75, 90)

            flood_risk_score = 0
            if rainfall > 260:
                flood_risk_score += 2
            if humidity > 84:
                flood_risk_score += 1
            flood_risk_score += int(rng.random() < 0.18)
            flood_risk_level = ["none", "low", "medium", "high", "severe"][clamp(flood_risk_score, 0, 4)]
            flood_events = int(np_rng.poisson(0.35 + (0.4 * flood_risk_score)))
            flood_events = int(clamp(flood_events, 0, 5))

            age_years = cluster.base_age_years + (season_index * 0.52)
            pruning_interval = clamp(
                rng.uniform(3.0, 13.0) + (1.2 - cluster.management_level) * 6.0,
                2.0,
                24.0,
            )
            fert_score = clamp(cluster.management_level + rng.uniform(-0.1, 0.1), 0.0, 1.0)
            pest_score = clamp(cluster.management_level + rng.uniform(-0.12, 0.12), 0.0, 1.0)
            fertilizer_frequency = pick_frequency(fert_score)
            pesticide_frequency = pick_frequency(pest_score)

            soil_ph = clamp(cluster.soil_ph_base + rng.uniform(-0.25, 0.25), 4.9, 7.2)
            bean_size_mm = clamp(
                6.4
                + 0.45 * cluster.management_level
                + 0.08 * smooth_peak(soil_ph, 6.0, 0.8)
                - 0.06 * flood_risk_score
                + rng.uniform(-0.18, 0.18),
                5.4,
                8.1,
            )
            bean_screen_size = infer_screen_size(bean_size_mm)
            bean_moisture = clamp(11.8 + 0.16 * flood_events + 0.03 * (humidity - 72) + rng.uniform(-0.55, 0.55), 9.5, 15.5)

            defect_black = clamp(0.35 + 0.38 * flood_events + rng.uniform(-0.12, 0.2), 0.0, 15.0)
            defect_mold = clamp(0.45 + 0.42 * flood_events + 0.03 * (humidity - 75) + rng.uniform(-0.1, 0.2), 0.0, 12.0)
            defect_immature = clamp(0.35 + 0.06 * max(temp - 25, 0) + rng.uniform(-0.08, 0.15), 0.0, 10.0)
            defect_broken = clamp(0.55 + 0.16 * max(6.4 - bean_size_mm, 0) + rng.uniform(-0.05, 0.15), 0.0, 12.0)
            defect_dried = clamp(0.15 + 0.08 * max(temp - 27, 0) + rng.uniform(-0.03, 0.06), 0.0, 3.0)
            defect_foreign = clamp(0.18 + 0.05 * flood_events + rng.uniform(-0.03, 0.08), 0.0, 3.0)
            total_defects = clamp(
                defect_black + defect_mold + defect_immature + defect_broken + defect_dried + defect_foreign,
                0.0,
                35.0,
            )

            age_peak = 0.72 + 0.34 * smooth_peak(age_years, 8.5, 5.0)
            soil_effect = 0.75 + 0.3 * smooth_peak(soil_ph, 6.0, 0.85)
            weather_effect = (
                0.72
                + 0.16 * smooth_peak(temp, 24.0, 3.2)
                + 0.15 * smooth_peak(rainfall, 205.0, 95.0)
                + 0.11 * smooth_peak(humidity, 74.0, 10.0)
            )
            elevation_effect = 0.82 + 0.2 * smooth_peak(farm.elevation_m, 560.0, 260.0)
            variety_effect = 1.0 if cluster.variety == "Robusta" else 0.94
            management_effect = (
                0.72
                * frequency_factor(fertilizer_frequency)
                * frequency_factor(pesticide_frequency)
                * type_factor(cluster.fertilizer_type)
                * type_factor(cluster.pesticide_type)
                * shade_factor(cluster.shade_tree_present)
                * (1.06 - (pruning_interval / 45.0))
            )
            flood_penalty = 1.0 - (0.045 * flood_events) - (0.028 * flood_risk_score)

            deterministic_yield = (
                cluster.plant_count
                * 0.42
                * age_peak
                * soil_effect
                * weather_effect
                * elevation_effect
                * variety_effect
                * management_effect
                * flood_penalty
            )
            yield_noise = np_rng.normal(0.0, 2.8)
            yield_kg = clamp(deterministic_yield + yield_noise, 8.0, 680.0)

            fine_raw = clamp(
                26.0
                + (bean_size_mm - 6.4) * 18.5
                + (13.0 - bean_moisture) * 2.2
                + cluster.management_level * 8.2
                - total_defects * 0.92
                - flood_events * 1.8
                + np_rng.normal(0.0, 0.35),
                6.0,
                58.0,
            )
            premium_raw = clamp(
                34.0
                + (bean_size_mm - 6.4) * 7.2
                + cluster.management_level * 9.0
                - total_defects * 0.43
                - flood_events * 1.1
                + np_rng.normal(0.0, 0.45),
                12.0,
                68.0,
            )
            commercial_raw = clamp(
                28.0
                + total_defects * 1.38
                + max(bean_moisture - 12.5, 0.0) * 2.6
                + flood_events * 1.6
                - cluster.management_level * 5.5
                + np_rng.normal(0.0, 0.5),
                8.0,
                84.0,
            )

            triplet = np.array([fine_raw, premium_raw, commercial_raw], dtype=float)
            triplet = np.clip(triplet, 0.5, None)
            triplet = (triplet / triplet.sum()) * 100.0
            fine_pct, premium_pct, commercial_pct = [float(round(x, 3)) for x in triplet]

            pre_total_trees = int(round(cluster.plant_count * rng.uniform(0.95, 1.02)))
            pre_yield_kg = float(round(prev_yield, 3))
            pre_grade_fine = float(round(pre_yield_kg * (prev_fine / 100.0), 3))
            pre_grade_premium = float(round(pre_yield_kg * (prev_premium / 100.0), 3))
            pre_grade_commercial = float(round(pre_yield_kg * (prev_commercial / 100.0), 3))

            row = {
                "farm_id": farm.id,
                "cluster_id": cluster.id,
                "farm_size_ha": round(farm.farm_area, 3),
                "elevation_m": round(farm.elevation_m, 3),
                "farm_cluster_count": float(farm_cluster_count),
                "cluster_plant_share_pct": float(round(cluster_plant_share_pct, 5)),
                "cluster_tree_density_per_sqm": float(round(cluster_tree_density, 6)),
                "plant_age_years": float(round(age_years, 5)),
                "number_of_plants": float(cluster.plant_count),
                "fertilizer_type": cluster.fertilizer_type,
                "fertilizer_frequency": fertilizer_frequency,
                "pesticide_type": cluster.pesticide_type,
                "pesticide_frequency": pesticide_frequency,
                "pruning_interval_months": float(round(pruning_interval, 4)),
                "shade_tree_present": cluster.shade_tree_present,
                "soil_ph": float(round(soil_ph, 4)),
                "avg_temp_c": float(round(temp, 4)),
                "avg_rainfall_mm": float(round(rainfall, 4)),
                "avg_humidity_pct": float(round(humidity, 4)),
                "flood_risk_level": flood_risk_level,
                "flood_events_count": float(flood_events),
                "pre_total_trees": float(pre_total_trees),
                "pre_yield_kg": pre_yield_kg,
                "pre_grade_fine": pre_grade_fine,
                "pre_grade_premium": pre_grade_premium,
                "pre_grade_commercial": pre_grade_commercial,
                "previous_fine_pct": float(round(prev_fine, 4)),
                "previous_premium_pct": float(round(prev_premium, 4)),
                "previous_commercial_pct": float(round(prev_commercial, 4)),
                "bean_size_mm": float(round(bean_size_mm, 4)),
                "bean_screen_size": bean_screen_size,
                "bean_moisture": float(round(bean_moisture, 4)),
                "defect_black_pct": float(round(defect_black, 4)),
                "defect_mold_infested_pct": float(round(defect_mold, 4)),
                "defect_immature_pct": float(round(defect_immature, 4)),
                "defect_broken_pct": float(round(defect_broken, 4)),
                "defect_dried_cherries_pct": float(round(defect_dried, 4)),
                "defect_foreign_matter_pct": float(round(defect_foreign, 4)),
                "pns_total_defects_pct": float(round(total_defects, 4)),
                "yield_kg": float(round(yield_kg, 4)),
                "fine_grade_pct": fine_pct,
                "premium_grade_pct": premium_pct,
                "commercial_grade_pct": commercial_pct,
                "_meta_season": season_name,
                "_meta_recorded_at": recorded_at.isoformat(),
            }
            dataset_rows.append(row)

            harvest_records.append(
                {
                    "id": str(uuid.uuid4()),
                    "cluster_id": cluster.id,
                    "season": season_name,
                    "yield_kg": float(round(yield_kg, 4)),
                    "grade_fine": fine_pct,
                    "grade_premium": premium_pct,
                    "grade_commercial": commercial_pct,
                    "recorded_at": recorded_at.isoformat(),
                    "actual_harvest_date": recorded_at.date().isoformat(),
                }
            )

            if season_index == len(SEASON_DEFS) - 1:
                latest_stage_by_cluster[cluster.id] = {
                    "id": str(uuid.uuid4()),
                    "cluster_id": cluster.id,
                    "date_planted": (recorded_at - timedelta(days=int(age_years * 365.2425))).date().isoformat(),
                    "number_of_plants": cluster.plant_count,
                    "variety": cluster.variety,
                    "fertilizer_type": cluster.fertilizer_type,
                    "fertilizer_frequency": fertilizer_frequency,
                    "pesticide_type": cluster.pesticide_type,
                    "pesticide_frequency": pesticide_frequency,
                    "last_pruned_date": (recorded_at - timedelta(days=int(pruning_interval * 30.4375))).date().isoformat(),
                    "shade_tree_present": cluster.shade_tree_present == "yes",
                    "soil_ph": float(round(soil_ph, 4)),
                    "avg_temp_c": float(round(temp, 4)),
                    "avg_rainfall_mm": float(round(rainfall, 4)),
                    "avg_humidity_pct": float(round(humidity, 4)),
                    "flood_risk_level": flood_risk_level,
                    "flood_events_count": flood_events,
                    "flood_last_event_date": (recorded_at - timedelta(days=30 * max(flood_events, 1))).date().isoformat(),
                    "season": season_name,
                    "pre_total_trees": pre_total_trees,
                    "pre_yield_kg": pre_yield_kg,
                    "pre_grade_fine": pre_grade_fine,
                    "pre_grade_premium": pre_grade_premium,
                    "pre_grade_commercial": pre_grade_commercial,
                    "previous_fine_pct": float(round(prev_fine, 4)),
                    "previous_premium_pct": float(round(prev_premium, 4)),
                    "previous_commercial_pct": float(round(prev_commercial, 4)),
                    "post_current_yield": float(round(yield_kg, 4)),
                    "post_grade_fine": fine_pct,
                    "post_grade_premium": premium_pct,
                    "post_grade_commercial": commercial_pct,
                    "current_yield": float(round(yield_kg, 4)),
                    "predicted_yield": float(round(yield_kg * rng.uniform(0.97, 1.04), 4)),
                    "bean_size_mm": float(round(bean_size_mm, 4)),
                    "bean_screen_size": bean_screen_size,
                    "bean_moisture": float(round(bean_moisture, 4)),
                    "defect_black_pct": float(round(defect_black, 4)),
                    "defect_mold_infested_pct": float(round(defect_mold, 4)),
                    "defect_immature_pct": float(round(defect_immature, 4)),
                    "defect_broken_pct": float(round(defect_broken, 4)),
                    "defect_dried_cherries_pct": float(round(defect_dried, 4)),
                    "defect_foreign_matter_pct": float(round(defect_foreign, 4)),
                    "pns_total_defects_pct": float(round(total_defects, 4)),
                    "updated_at": recorded_at.isoformat(),
                    "created_at": (recorded_at - timedelta(days=1)).isoformat(),
                }

            prev_yield = yield_kg
            prev_fine, prev_premium, prev_commercial = fine_pct, premium_pct, commercial_pct

    return dataset_rows, latest_stage_by_cluster, harvest_records


def write_training_csv(output_csv: str, rows: List[Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(output_csv), exist_ok=True)
    columns = FEATURE_KEYS + TARGET_KEYS
    with open(output_csv, "w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})


def build_admin_payload(
    farms: List[FarmProfile],
    clusters: List[ClusterProfile],
    latest_stage_by_cluster: Dict[str, Dict[str, Any]],
    harvest_records: List[Dict[str, Any]],
) -> Dict[str, Any]:
    users = [
        {
            "id": farm.user_id,
            "first_name": farm.first_name,
            "last_name": farm.last_name,
            "role": "farmer",
        }
        for farm in farms
    ]

    farms_json = [
        {
            "id": farm.id,
            "farm_name": farm.farm_name,
            "farm_area": farm.farm_area,
            "elevation_m": farm.elevation_m,
            "overall_tree_count": farm.overall_tree_count,
            "user_id": farm.user_id,
        }
        for farm in farms
    ]

    farms_by_id = {farm["id"]: farm for farm in farms_json}
    users_by_id = {user["id"]: user for user in users}
    harvest_by_cluster: Dict[str, List[Dict[str, Any]]] = {}
    for record in harvest_records:
        harvest_by_cluster.setdefault(str(record["cluster_id"]), []).append(record)

    clusters_json: List[Dict[str, Any]] = []
    for cluster in clusters:
        farm = farms_by_id[cluster.farm_id]
        user = users_by_id[farm["user_id"]]
        stage = latest_stage_by_cluster.get(cluster.id, {})
        cluster_harvest = sorted(
            harvest_by_cluster.get(cluster.id, []),
            key=lambda item: item.get("recorded_at") or "",
            reverse=True,
        )

        avg_yield = np.mean([item.get("yield_kg", 0.0) for item in cluster_harvest[-3:]]) if cluster_harvest else 0.0
        current_yield = stage.get("current_yield", 0.0)
        risk_index = (avg_yield - current_yield) / max(avg_yield, 1.0) if avg_yield > 0 else 0.0
        if risk_index > 0.35:
            risk_level = "Critical"
        elif risk_index > 0.2:
            risk_level = "High"
        elif risk_index > 0.08:
            risk_level = "Moderate"
        else:
            risk_level = "Low"

        clusters_json.append(
            {
                "id": cluster.id,
                "farm_id": cluster.farm_id,
                "cluster_name": cluster.cluster_name,
                "area_size_sqm": cluster.area_size_sqm,
                "plant_count": cluster.plant_count,
                "plant_stage": "ready-to-harvest",
                "created_at": cluster.created_at.isoformat(),
                "risk_level": risk_level,
                "cluster_stage_data": [stage],
                "harvest_records": cluster_harvest,
                "farms": {
                    **farm,
                    "users": {
                        "id": user["id"],
                        "first_name": user["first_name"],
                        "last_name": user["last_name"],
                    },
                },
            }
        )

    return {
        "mode": "synthetic",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "users": users,
        "farms": farms_json,
        "clusters": clusters_json,
        "harvest_records": harvest_records,
    }


def write_admin_json(output_path: str, payload: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)

    farms, clusters = generate_farms_and_clusters(args.rows, rng)
    rows, latest_stage_by_cluster, harvest_records = generate_synthetic_records(farms, clusters, rng)

    write_training_csv(args.output_csv, rows)
    admin_payload = build_admin_payload(farms, clusters, latest_stage_by_cluster, harvest_records)
    write_admin_json(args.output_admin_json, admin_payload)

    print(
        f"Synthetic generation complete. rows={len(rows)} farms={len(farms)} "
        f"clusters={len(clusters)} harvest_records={len(harvest_records)}"
    )
    print(f"Training CSV: {os.path.abspath(args.output_csv)}")
    print(f"Admin JSON: {os.path.abspath(args.output_admin_json)}")


if __name__ == "__main__":
    main()
