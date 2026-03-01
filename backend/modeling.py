from __future__ import annotations

import re
from hashlib import sha1
from typing import Any, Dict, Iterable, List


FEATURE_KEYS: List[str] = [
    "farm_id",
    "cluster_id",
    "farm_size_ha",
    "elevation_m",
    "farm_cluster_count",
    "cluster_plant_share_pct",
    "cluster_tree_density_per_sqm",
    "plant_age_years",
    "number_of_plants",
    "fertilizer_type",
    "fertilizer_frequency",
    "pesticide_type",
    "pesticide_frequency",
    "pruning_interval_months",
    "shade_tree_present",
    "soil_ph",
    "avg_temp_c",
    "avg_rainfall_mm",
    "avg_humidity_pct",
    "flood_risk_level",
    "flood_events_count",
    "pre_total_trees",
    "pre_yield_kg",
    "pre_grade_fine",
    "pre_grade_premium",
    "pre_grade_commercial",
    "previous_fine_pct",
    "previous_premium_pct",
    "previous_commercial_pct",
    "bean_size_mm",
    "bean_screen_size",
    "bean_moisture",
    "defect_black_pct",
    "defect_mold_infested_pct",
    "defect_immature_pct",
    "defect_broken_pct",
    "defect_dried_cherries_pct",
    "defect_foreign_matter_pct",
    "pns_total_defects_pct",
]

TARGET_KEYS: List[str] = [
    "yield_kg",
    "fine_grade_pct",
    "premium_grade_pct",
    "commercial_grade_pct",
]

NUMERIC_FEATURE_KEYS: List[str] = [
    "farm_id",
    "cluster_id",
    "farm_size_ha",
    "elevation_m",
    "farm_cluster_count",
    "cluster_plant_share_pct",
    "cluster_tree_density_per_sqm",
    "plant_age_years",
    "number_of_plants",
    "pruning_interval_months",
    "soil_ph",
    "avg_temp_c",
    "avg_rainfall_mm",
    "avg_humidity_pct",
    "flood_events_count",
    "pre_total_trees",
    "pre_yield_kg",
    "pre_grade_fine",
    "pre_grade_premium",
    "pre_grade_commercial",
    "previous_fine_pct",
    "previous_premium_pct",
    "previous_commercial_pct",
    "bean_size_mm",
    "bean_moisture",
    "defect_black_pct",
    "defect_mold_infested_pct",
    "defect_immature_pct",
    "defect_broken_pct",
    "defect_dried_cherries_pct",
    "defect_foreign_matter_pct",
    "pns_total_defects_pct",
]

CATEGORICAL_FEATURE_KEYS: List[str] = [
    "fertilizer_type",
    "fertilizer_frequency",
    "pesticide_type",
    "pesticide_frequency",
    "shade_tree_present",
    "flood_risk_level",
    "bean_screen_size",
]

FEATURE_ALIASES: Dict[str, List[str]] = {
    "farm_id": ["farm_id", "farmid"],
    "cluster_id": ["cluster_id", "clusterid"],
    "farm_size_ha": ["farm_size_ha", "farm_area_ha", "farm_area"],
    "elevation_m": ["elevation_m", "farm_elevation_m", "elevation"],
    "farm_cluster_count": ["farm_cluster_count", "clusters_per_farm", "cluster_count_farm"],
    "cluster_plant_share_pct": ["cluster_plant_share_pct", "plant_share_pct", "plants_cluster_share_pct"],
    "cluster_tree_density_per_sqm": [
        "cluster_tree_density_per_sqm",
        "cluster_tree_density",
        "trees_per_sqm",
    ],
    "plant_age_years": ["plant_age_years", "plant_age_yrs", "plant_age_year"],
    "number_of_plants": ["number_of_plants", "plant_count", "total_plants"],
    "fertilizer_type": ["fertilizer_type"],
    "fertilizer_frequency": ["fertilizer_frequency"],
    "pesticide_type": ["pesticide_type"],
    "pesticide_frequency": ["pesticide_frequency"],
    "pruning_interval_months": ["pruning_interval_months", "pruning_interval", "pruning_months"],
    "shade_tree_present": ["shade_tree_present", "shade_trees", "has_shade_tree"],
    "soil_ph": ["soil_ph", "soil_p_h", "ph"],
    "avg_temp_c": ["avg_temp_c", "monthly_temperature", "average_temperature_c"],
    "avg_rainfall_mm": ["avg_rainfall_mm", "rainfall", "rainfall_mm"],
    "avg_humidity_pct": ["avg_humidity_pct", "humidity", "humidity_pct"],
    "flood_risk_level": ["flood_risk_level", "flood_risk"],
    "flood_events_count": ["flood_events_count", "flood_count", "flood_events"],
    "pre_total_trees": ["pre_total_trees", "previous_total_trees"],
    "pre_yield_kg": ["pre_yield_kg", "previous_yield", "previous_yield_kg"],
    "pre_grade_fine": ["pre_grade_fine", "previous_grade_fine", "fine_grade_kg_before"],
    "pre_grade_premium": ["pre_grade_premium", "previous_grade_premium", "premium_grade_kg_before"],
    "pre_grade_commercial": [
        "pre_grade_commercial",
        "previous_grade_commercial",
        "commercial_grade_kg_before",
    ],
    "previous_fine_pct": ["previous_fine_pct", "grade_fine", "fine_grade_pct_before"],
    "previous_premium_pct": ["previous_premium_pct", "grade_premium", "premium_grade_pct_before"],
    "previous_commercial_pct": [
        "previous_commercial_pct",
        "grade_commercial",
        "commercial_grade_pct_before",
    ],
    "bean_size_mm": ["bean_size_mm", "bean_size", "bean_diameter_mm"],
    "bean_screen_size": ["bean_screen_size", "screen_size", "bean_size_class"],
    "bean_moisture": ["bean_moisture", "bean_moisture_pct", "moisture"],
    "defect_black_pct": ["defect_black_pct", "black_bean_pct"],
    "defect_mold_infested_pct": ["defect_mold_infested_pct", "mold_infested_pct", "defect_moldy_pct"],
    "defect_immature_pct": ["defect_immature_pct", "immature_bean_pct"],
    "defect_broken_pct": ["defect_broken_pct", "broken_bean_pct"],
    "defect_dried_cherries_pct": ["defect_dried_cherries_pct", "dried_cherries_pct"],
    "defect_foreign_matter_pct": ["defect_foreign_matter_pct", "foreign_matter_pct"],
    "pns_total_defects_pct": ["pns_total_defects_pct", "total_defects_pct"],
}

TARGET_ALIASES: Dict[str, List[str]] = {
    "yield_kg": ["yield_kg", "current_yield", "target_yield_kg", "post_current_yield"],
    "fine_grade_pct": ["fine_grade_pct", "grade_fine", "post_grade_fine", "fine_pct"],
    "premium_grade_pct": ["premium_grade_pct", "grade_premium", "post_grade_premium", "premium_pct"],
    "commercial_grade_pct": [
        "commercial_grade_pct",
        "grade_commercial",
        "post_grade_commercial",
        "commercial_pct",
    ],
}

FREQUENCY_CANONICAL = {"never", "rarely", "sometimes", "often"}
TYPE_CANONICAL = {"organic", "non-organic"}
BOOL_CANONICAL = {"yes", "no"}
FLOOD_RISK_CANONICAL = {"none", "low", "medium", "high", "severe"}
BEAN_SCREEN_CANONICAL = {"extra-small", "small", "medium", "large", "extra-large"}


def normalize_column_name(name: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "_", name.strip().lower())
    return re.sub(r"_+", "_", normalized).strip("_")


def normalize_column_names(names: Iterable[str]) -> Dict[str, str]:
    # Mapping from original name -> normalized name.
    return {name: normalize_column_name(name) for name in names}


def resolve_aliases(
    available_columns: Iterable[str], alias_map: Dict[str, List[str]]
) -> Dict[str, str]:
    available = set(available_columns)
    resolved: Dict[str, str] = {}
    for canonical, aliases in alias_map.items():
        for alias in aliases:
            if alias in available:
                resolved[canonical] = alias
                break
    return resolved


def hash_identifier(value: Any) -> float:
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text:
        return 0.0
    digest = sha1(text.encode("utf-8")).hexdigest()
    # Stable bounded numeric representation for modeling.
    return float(int(digest[:12], 16))
