from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold, RandomizedSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from backend.modeling import (
    BEAN_SCREEN_CANONICAL,
    CATEGORICAL_FEATURE_KEYS,
    FEATURE_ALIASES,
    FEATURE_KEYS,
    FLOOD_RISK_CANONICAL,
    NUMERIC_FEATURE_KEYS,
    TARGET_ALIASES,
    TARGET_KEYS,
    hash_identifier,
    normalize_column_names,
    resolve_aliases,
)


DEFAULT_RANDOM_STATE = 42
DEFAULT_TEST_SIZE = 0.2
DEFAULT_CV_SPLITS = 5
DEFAULT_MIN_ROWS = 200
DEFAULT_MODEL_DIR = os.path.abspath(
    os.getenv("ML_MODEL_DIR", os.path.join(os.path.dirname(__file__), "..", "ml_models"))
)
MODEL_FILE_MAP = {
    "yield_kg": "trained_yield_model_RF.joblib",
    "fine_grade_pct": "trained_grade_model_fine_grade_pct.joblib",
    "premium_grade_pct": "trained_grade_model_premium_grade_pct.joblib",
    "commercial_grade_pct": "trained_grade_model_commercial_grade_pct.joblib",
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train IKAPE yield/grade models with reproducible preprocessing and evaluation."
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Path to CSV dataset containing feature and target columns.",
    )
    parser.add_argument(
        "--model-dir",
        default=DEFAULT_MODEL_DIR,
        help=f"Directory to write model artifacts (default: {DEFAULT_MODEL_DIR}).",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=DEFAULT_TEST_SIZE,
        help=f"Holdout ratio for final test set (default: {DEFAULT_TEST_SIZE}).",
    )
    parser.add_argument(
        "--cv-splits",
        type=int,
        default=DEFAULT_CV_SPLITS,
        help=f"K-fold splits for model selection CV (default: {DEFAULT_CV_SPLITS}).",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=DEFAULT_RANDOM_STATE,
        help=f"Random state for deterministic splits/search (default: {DEFAULT_RANDOM_STATE}).",
    )
    parser.add_argument(
        "--min-rows",
        type=int,
        default=DEFAULT_MIN_ROWS,
        help=f"Minimum dataset rows after cleaning (default: {DEFAULT_MIN_ROWS}).",
    )
    parser.add_argument(
        "--min-yield-r2",
        type=float,
        default=0.7,
        help="Minimum holdout R2 required for yield model publication (default: 0.7).",
    )
    parser.add_argument(
        "--min-grade-r2",
        type=float,
        default=0.65,
        help="Minimum holdout R2 required for grade model publication (default: 0.65).",
    )
    parser.add_argument(
        "--search-iter",
        type=int,
        default=16,
        help="Randomized search iterations per candidate model (default: 16).",
    )
    parser.add_argument(
        "--quick-train",
        action="store_true",
        help="Use reduced model search space for faster turnaround.",
    )
    return parser.parse_args()


def _normalize_categorical_value(key: str, value: Any) -> Any:
    if value is None:
        return np.nan
    text = str(value).strip().lower()
    if not text:
        return np.nan

    if key in ("fertilizer_frequency", "pesticide_frequency"):
        if text.startswith("often"):
            return "often"
        if text.startswith("sometimes"):
            return "sometimes"
        if text.startswith("rarely"):
            return "rarely"
        if text.startswith("never"):
            return "never"
        return np.nan

    if key in ("fertilizer_type", "pesticide_type"):
        normalized = text.replace("_", "-").replace(" ", "-")
        if normalized in ("nonorganic", "non-organic"):
            return "non-organic"
        if normalized == "organic":
            return "organic"
        return np.nan

    if key == "shade_tree_present":
        if text in ("yes", "true", "1"):
            return "yes"
        if text in ("no", "false", "0"):
            return "no"
        return np.nan

    if key == "flood_risk_level":
        normalized = text.replace("_", "-").replace(" ", "-")
        if normalized in FLOOD_RISK_CANONICAL:
            return normalized
        return np.nan

    if key == "bean_screen_size":
        normalized = text.replace("_", "-").replace(" ", "-")
        if normalized in BEAN_SCREEN_CANONICAL:
            return normalized
        return np.nan

    if key in ("farm_id", "cluster_id"):
        return text

    return text


def _validate_categorical_domain(df: pd.DataFrame) -> Dict[str, int]:
    dropped_counts: Dict[str, int] = {}
    for key in CATEGORICAL_FEATURE_KEYS:
        before_na = df[key].isna().sum()
        df[key] = df[key].map(lambda val: _normalize_categorical_value(key, val))
        after_na = df[key].isna().sum()
        dropped_counts[key] = int(after_na - before_na)
    return dropped_counts


def _load_and_prepare_dataset(dataset_path: str, min_rows: int) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    raw = pd.read_csv(dataset_path)
    if raw.empty:
        raise ValueError("Dataset is empty.")

    normalized_name_map = normalize_column_names(raw.columns)
    normalized_df = raw.rename(columns=normalized_name_map)

    feature_cols = resolve_aliases(normalized_df.columns, FEATURE_ALIASES)
    target_cols = resolve_aliases(normalized_df.columns, TARGET_ALIASES)

    missing_features = [key for key in FEATURE_KEYS if key not in feature_cols]
    missing_targets = [key for key in TARGET_KEYS if key not in target_cols]

    if missing_features:
        raise ValueError(
            f"Dataset is missing required feature columns: {', '.join(missing_features)}"
        )
    if missing_targets:
        raise ValueError(
            f"Dataset is missing required target columns: {', '.join(missing_targets)}"
        )

    prepared = pd.DataFrame()
    for canonical_key in FEATURE_KEYS:
        prepared[canonical_key] = normalized_df[feature_cols[canonical_key]]
    for canonical_key in TARGET_KEYS:
        prepared[canonical_key] = normalized_df[target_cols[canonical_key]]

    # Stable numeric encoding of high-cardinality identifiers.
    prepared["farm_id"] = prepared["farm_id"].map(hash_identifier)
    prepared["cluster_id"] = prepared["cluster_id"].map(hash_identifier)

    initial_rows = len(prepared)
    duplicate_rows = int(prepared.duplicated().sum())
    if duplicate_rows:
        prepared = prepared.drop_duplicates().copy()

    for key in NUMERIC_FEATURE_KEYS + TARGET_KEYS:
        prepared[key] = pd.to_numeric(prepared[key], errors="coerce")

    categorical_drops = _validate_categorical_domain(prepared)
    missing_rate_before_fill = prepared.isna().mean().round(4).to_dict()

    all_null_numeric_filled: List[str] = []
    for key in NUMERIC_FEATURE_KEYS:
        if prepared[key].isna().all():
            prepared[key] = 0.0
            all_null_numeric_filled.append(key)

    categorical_default_fill = {
        "flood_risk_level": "none",
        "bean_screen_size": "medium",
    }
    all_null_categorical_filled: Dict[str, str] = {}
    for key in CATEGORICAL_FEATURE_KEYS:
        if prepared[key].isna().all():
            fill_value = categorical_default_fill.get(key, "unknown")
            prepared[key] = fill_value
            all_null_categorical_filled[key] = fill_value

    # Keep rows with at least one target value before final filtering.
    prepared = prepared.dropna(
        subset=[
            "yield_kg",
            "fine_grade_pct",
            "premium_grade_pct",
            "commercial_grade_pct",
        ],
        how="all",
    )

    # Targets are percentages/weights that should never be negative.
    for key in TARGET_KEYS:
        prepared[key] = prepared[key].clip(lower=0)

    # Normalize grade percentages to sum to 100 when non-zero.
    grade_keys = ["fine_grade_pct", "premium_grade_pct", "commercial_grade_pct"]
    grade_sum = prepared[grade_keys].sum(axis=1)
    valid_grade_rows = grade_sum > 0
    prepared.loc[valid_grade_rows, grade_keys] = (
        prepared.loc[valid_grade_rows, grade_keys]
        .div(grade_sum[valid_grade_rows], axis=0)
        .mul(100.0)
    )

    prepared = prepared.reset_index(drop=True)
    if len(prepared) < min_rows:
        raise ValueError(
            f"Not enough rows after cleaning: got {len(prepared)}, required at least {min_rows}."
        )

    missing_rate = prepared.isna().mean().round(4).to_dict()
    quality_report = {
        "initial_rows": int(initial_rows),
        "rows_after_dedup": int(initial_rows - duplicate_rows),
        "rows_after_cleaning": int(len(prepared)),
        "dropped_duplicates": duplicate_rows,
        "missing_rate_before_default_fill": missing_rate_before_fill,
        "missing_rate_by_column": missing_rate,
        "categorical_values_dropped_to_nan": categorical_drops,
        "all_null_numeric_filled_with_zero": all_null_numeric_filled,
        "all_null_categorical_filled": all_null_categorical_filled,
    }
    return prepared, quality_report


def _build_pipeline(model: Any) -> Pipeline:
    numeric_preprocess = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )
    categorical_preprocess = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_preprocess, NUMERIC_FEATURE_KEYS),
            ("cat", categorical_preprocess, CATEGORICAL_FEATURE_KEYS),
        ]
    )

    return Pipeline(
        steps=[
            ("preprocess", preprocessor),
            ("model", model),
        ]
    )


def _candidate_search_space(
    random_state: int,
    quick_train: bool = False,
) -> List[Tuple[str, Any, Dict[str, List[Any]]]]:
    if quick_train:
        return [
            (
                "random_forest",
                RandomForestRegressor(random_state=random_state, n_jobs=-1),
                {
                    "model__n_estimators": [120, 180],
                    "model__max_depth": [None, 10, 16],
                    "model__min_samples_split": [2, 4],
                    "model__min_samples_leaf": [1, 2],
                    "model__max_features": ["sqrt", 0.8, 1.0],
                },
            ),
            (
                "extra_trees",
                ExtraTreesRegressor(random_state=random_state, n_jobs=-1),
                {
                    "model__n_estimators": [120, 180],
                    "model__max_depth": [None, 10, 16],
                    "model__min_samples_split": [2, 4],
                    "model__min_samples_leaf": [1, 2],
                    "model__max_features": ["sqrt", 0.8, 1.0],
                },
            ),
            (
                "gradient_boosting",
                GradientBoostingRegressor(random_state=random_state),
                {
                    "model__n_estimators": [120, 180],
                    "model__learning_rate": [0.05, 0.08, 0.12],
                    "model__max_depth": [2, 3],
                    "model__subsample": [0.85, 1.0],
                    "model__min_samples_leaf": [1, 2],
                },
            ),
        ]

    return [
        (
            "random_forest",
            RandomForestRegressor(random_state=random_state, n_jobs=-1),
            {
                "model__n_estimators": [200, 350, 500, 700],
                "model__max_depth": [None, 10, 14, 20],
                "model__min_samples_split": [2, 4, 8],
                "model__min_samples_leaf": [1, 2, 4],
                "model__max_features": ["sqrt", 0.6, 0.8, 1.0],
            },
        ),
        (
            "extra_trees",
            ExtraTreesRegressor(random_state=random_state, n_jobs=-1),
            {
                "model__n_estimators": [250, 400, 650, 900],
                "model__max_depth": [None, 10, 16, 24],
                "model__min_samples_split": [2, 4, 8],
                "model__min_samples_leaf": [1, 2, 3],
                "model__max_features": ["sqrt", 0.6, 0.8, 1.0],
            },
        ),
        (
            "gradient_boosting",
            GradientBoostingRegressor(random_state=random_state),
            {
                "model__n_estimators": [180, 260, 360],
                "model__learning_rate": [0.03, 0.05, 0.08, 0.12],
                "model__max_depth": [2, 3, 4],
                "model__subsample": [0.7, 0.85, 1.0],
                "model__min_samples_leaf": [1, 2, 4],
            },
        ),
    ]


def _evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae = float(mean_absolute_error(y_true, y_pred))
    r2 = float(r2_score(y_true, y_pred))
    return {
        "rmse": round(rmse, 6),
        "mae": round(mae, 6),
        "r2": round(r2, 6),
    }


def _train_one_target(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    random_state: int,
    cv_splits: int,
    search_iter: int,
    quick_train: bool,
) -> Tuple[Pipeline, Dict[str, Any]]:
    train_mask = y_train.notna()
    X_train_target = X_train.loc[train_mask]
    y_train_target = y_train.loc[train_mask]

    test_mask = y_test.notna()
    X_test_target = X_test.loc[test_mask]
    y_test_target = y_test.loc[test_mask]

    if len(y_train_target) < max(30, cv_splits * 5):
        raise RuntimeError(
            f"Insufficient non-null samples for training target ({len(y_train_target)} rows)."
        )
    if len(y_test_target) == 0:
        raise RuntimeError("No non-null test samples available for target evaluation.")

    best_estimator: Pipeline | None = None
    best_candidate_name = ""
    best_cv_rmse = float("inf")
    target_candidates: List[Dict[str, Any]] = []
    cv = KFold(n_splits=cv_splits, shuffle=True, random_state=random_state)

    for candidate_name, candidate_model, search_space in _candidate_search_space(random_state, quick_train):
        pipeline = _build_pipeline(candidate_model)
        search = RandomizedSearchCV(
            estimator=pipeline,
            param_distributions=search_space,
            n_iter=search_iter,
            scoring="neg_root_mean_squared_error",
            n_jobs=-1,
            cv=cv,
            random_state=random_state,
            verbose=0,
        )
        search.fit(X_train_target, y_train_target)
        candidate_cv_rmse = float(-search.best_score_)
        target_candidates.append(
            {
                "candidate": candidate_name,
                "cv_rmse": round(candidate_cv_rmse, 6),
                "best_params": search.best_params_,
            }
        )
        if candidate_cv_rmse < best_cv_rmse:
            best_cv_rmse = candidate_cv_rmse
            best_candidate_name = candidate_name
            best_estimator = search.best_estimator_

    if best_estimator is None:
        raise RuntimeError("No model candidate succeeded.")

    y_test_pred = best_estimator.predict(X_test_target)
    test_metrics = _evaluate_predictions(y_test_target.to_numpy(), y_test_pred)

    summary = {
        "selected_candidate": best_candidate_name,
        "cv_rmse": round(best_cv_rmse, 6),
        "test_metrics": test_metrics,
        "candidates": target_candidates,
    }
    return best_estimator, summary


def _compute_feature_quality(df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    report: Dict[str, Dict[str, Any]] = {}

    def _safe_round(value: float) -> Any:
        if pd.isna(value):
            return None
        return round(float(value), 4)

    for key in NUMERIC_FEATURE_KEYS:
        series = pd.to_numeric(df[key], errors="coerce")
        report[key] = {
            "mean": _safe_round(series.mean(skipna=True)),
            "std": _safe_round(series.std(skipna=True)),
            "min": _safe_round(series.min(skipna=True)),
            "max": _safe_round(series.max(skipna=True)),
        }
    return report


def main() -> None:
    args = _parse_args()
    os.makedirs(args.model_dir, exist_ok=True)

    cleaned_df, dataset_quality = _load_and_prepare_dataset(args.dataset, min_rows=args.min_rows)

    X = cleaned_df[FEATURE_KEYS]
    y = cleaned_df[TARGET_KEYS]

    X_train, X_test, y_train_df, y_test_df = train_test_split(
        X,
        y,
        test_size=args.test_size,
        random_state=args.random_state,
    )

    training_report: Dict[str, Any] = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_path": os.path.abspath(args.dataset),
        "random_state": args.random_state,
        "test_size": args.test_size,
        "cv_splits": args.cv_splits,
        "search_iter": args.search_iter,
        "quick_train": args.quick_train,
        "feature_keys": FEATURE_KEYS,
        "target_keys": TARGET_KEYS,
        "dataset_quality": dataset_quality,
        "feature_quality": _compute_feature_quality(cleaned_df),
        "targets": {},
        "quality_gates": {
            "min_yield_r2": args.min_yield_r2,
            "min_grade_r2": args.min_grade_r2,
        },
        "metric_formulas": {
            "rmse": "sqrt(mean((y_true - y_pred)^2))",
            "mae": "mean(abs(y_true - y_pred))",
            "r2": "1 - sum((y_true - y_pred)^2)/sum((y_true - mean(y_true))^2)",
        },
    }

    quality_gate_failures: List[str] = []
    fitted_estimators: Dict[str, Pipeline] = {}
    prepared_artifact_names: Dict[str, str] = {}

    for target_key in TARGET_KEYS:
        y_train = y_train_df[target_key]
        y_test = y_test_df[target_key]
        estimator, target_summary = _train_one_target(
            X_train=X_train,
            y_train=y_train,
            X_test=X_test,
            y_test=y_test,
            random_state=args.random_state,
            cv_splits=args.cv_splits,
            search_iter=args.search_iter,
            quick_train=args.quick_train,
        )
        artifact_name = MODEL_FILE_MAP[target_key]
        prepared_artifact_names[target_key] = artifact_name
        fitted_estimators[target_key] = estimator
        target_summary["artifact"] = artifact_name
        training_report["targets"][target_key] = target_summary

        achieved_r2 = target_summary["test_metrics"]["r2"]
        required_r2 = args.min_yield_r2 if target_key == "yield_kg" else args.min_grade_r2
        if achieved_r2 < required_r2:
            quality_gate_failures.append(
                f"{target_key}: R2={achieved_r2:.4f} is below required {required_r2:.4f}"
            )

    metadata_path = os.path.join(args.model_dir, "model_metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(training_report, f, indent=2)

    if quality_gate_failures:
        failed_dir = os.path.join(
            args.model_dir,
            "failed_training",
            datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
        )
        os.makedirs(failed_dir, exist_ok=True)
        for target_key, estimator in fitted_estimators.items():
            artifact_name = prepared_artifact_names[target_key]
            joblib.dump(estimator, os.path.join(failed_dir, artifact_name))
        raise RuntimeError(
            "Quality gate failed. Existing production artifacts were not overwritten. "
            "Failed artifacts were saved under model_dir/failed_training for inspection:\n"
            + "\n".join(quality_gate_failures)
        )

    for target_key, estimator in fitted_estimators.items():
        artifact_name = prepared_artifact_names[target_key]
        artifact_path = os.path.join(args.model_dir, artifact_name)
        joblib.dump(estimator, artifact_path)

    print("Training complete.")
    print(f"Model artifacts saved to: {os.path.abspath(args.model_dir)}")
    print(f"Metadata report: {metadata_path}")


if __name__ == "__main__":
    main()
