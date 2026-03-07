"""
Phase 2: Smart Recommendations - Model Training Pipeline
Trains a Random Forest classifier to rank recommendations by effectiveness
"""

import os
import sys
import json
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score, f1_score, confusion_matrix
import joblib
import warnings
warnings.filterwarnings('ignore')

# Try to import skl2onnx for ONNX export
try:
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    ONNX_AVAILABLE = True
except ImportError:
    print("WARNING: skl2onnx not installed. ONNX export will be skipped.")
    ONNX_AVAILABLE = False

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MODEL_DIR = os.path.join(PROJECT_ROOT, 'ml_models')
OUTPUT_ONNX = os.path.join(MODEL_DIR, 'trained_recommendation_model.onnx')
OUTPUT_JOBLIB = os.path.join(MODEL_DIR, 'trained_recommendation_model.joblib')
METRICS_FILE = os.path.join(MODEL_DIR, 'recommendation_model_metrics.json')

# Dataset path
DATASET_PATH = os.path.join(PROJECT_ROOT, 'robusta_coffee_farm_dataset.csv')

# Feature configuration
NUMERICAL_FEATURES = [
    'plant_age_months', 'number_of_plants', 'pruning_interval_months',
    'soil_ph', 'avg_temp_c', 'avg_rainfall_mm', 'avg_humidity_pct',
    'elevation_m', 'previous_yield_per_tree', 'previous_quality_score', 'yield_trend'
]

CATEGORICAL_FEATURES = [
    'fertilizer_type', 'fertilizer_frequency', 
    'pesticide_type', 'pesticide_frequency', 'shade_tree_present'
]

RECOMMENDATION_TYPES = [
    'fertilizer', 'pesticide', 'pruning', 'shade', 'irrigation', 'soil_amendment'
]


def load_and_prepare_data():
    """Load and prepare training data from the dataset"""
    print("Loading dataset...")
    
    if not os.path.exists(DATASET_PATH):
        print(f"ERROR: Dataset not found at {DATASET_PATH}")
        sys.exit(1)
    
    df = pd.read_csv(DATASET_PATH)
    print(f"Loaded {len(df)} records from dataset")
    
    # Map dataset columns to model features
    df['plant_age_months'] = df['Plant_Age_Months']
    df['number_of_plants'] = df['Tree_Count']
    df['fertilizer_type'] = df['Fertilizer_Type'].fillna('None')
    df['fertilizer_frequency'] = df['Fertilizer_Freq_per_Year'].fillna('Never')
    df['pesticide_type'] = df['Pesticide_Type'].fillna('None')
    df['pesticide_frequency'] = df['Pesticide_Freq_per_Year'].fillna('Never')
    df['shade_tree_present'] = df['Shade_Tree_Present'].map({'Yes': 1, 'No': 0})
    df['soil_ph'] = df['Soil_pH']
    df['avg_temp_c'] = df['Avg_Temp_C']
    df['avg_rainfall_mm'] = df['Avg_Rainfall_mm']
    df['avg_humidity_pct'] = df['Avg_Humidity_pct']
    df['elevation_m'] = df['Elevation_m']
    
    # Compute previous yield per tree (simulated from dataset)
    # In production, this would come from harvest_records
    np.random.seed(42)
    df['previous_yield_per_tree'] = np.random.uniform(0.5, 2.5, len(df))
    
    # Compute quality score from Quality_Grade
    grade_to_score = {'Premium': 85, 'Fine': 65, 'Commercial': 45}
    df['previous_quality_score'] = df['Quality_Grade'].map(grade_to_score).fillna(50)
    
    # Compute yield trend (simulated - in production, compute from historical data)
    df['yield_trend'] = np.random.choice([-1, 0, 1], size=len(df), p=[0.2, 0.5, 0.3])
    
    return df


def generate_recommendation_targets(df):
    """
    Generate recommendation targets based on cluster conditions
    This simulates what recommendations would be given and their outcomes
    """
    print("Generating recommendation targets...")
    
    # Create a record for each recommendation type
    records = []
    
    for idx, row in df.iterrows():
        for rec_type in RECOMMENDATION_TYPES:
            # Determine if recommendation is needed based on conditions
            recommendation_needed = False
            effectiveness_score = 50  # default
            
            if rec_type == 'fertilizer':
                if pd.isna(row['Fertilizer_Type']) or row['Fertilizer_Type'] == 'None':
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([85, 70, 45], p=[0.4, 0.4, 0.2])
                elif row['Fertilizer_Freq_per_Year'] in ['Never', 'Rarely']:
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([75, 60, 40], p=[0.3, 0.5, 0.2])
                    
            elif rec_type == 'pesticide':
                if pd.isna(row['Pesticide_Type']) or row['Pesticide_Type'] == 'None':
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([80, 65, 45], p=[0.35, 0.45, 0.2])
                elif row['Avg_Humidity_pct'] > 75:
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([70, 55, 35], p=[0.3, 0.5, 0.2])
                    
            elif rec_type == 'pruning':
                # No pruning date in dataset, simulate based on plant age
                if row['plant_age_months'] > 24:
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([90, 75, 50], p=[0.4, 0.4, 0.2])
                    
            elif rec_type == 'shade':
                if row['Shade_Tree_Present'] == 'No':
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([75, 60, 40], p=[0.3, 0.5, 0.2])
                elif row['Avg_Temp_C'] > 28:
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([70, 55, 35], p=[0.25, 0.55, 0.2])
                    
            elif rec_type == 'irrigation':
                if row['Avg_Rainfall_mm'] < 100:
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([80, 65, 45], p=[0.35, 0.45, 0.2])
                elif row['Avg_Rainfall_mm'] > 250:
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([70, 55, 40], p=[0.25, 0.55, 0.2])
                    
            elif rec_type == 'soil_amendment':
                if row['Soil_pH'] < 5.5 or row['Soil_pH'] > 6.5:
                    recommendation_needed = True
                    effectiveness_score = np.random.choice([85, 70, 50], p=[0.4, 0.4, 0.2])
            
            if recommendation_needed:
                # Create target category
                if effectiveness_score >= 70:
                    target = 'high'
                elif effectiveness_score >= 40:
                    target = 'medium'
                else:
                    target = 'low'
                
                records.append({
                    'rec_type': rec_type,
                    'plant_age_months': row['plant_age_months'],
                    'number_of_plants': row['number_of_plants'],
                    'fertilizer_type': row['fertilizer_type'],
                    'fertilizer_frequency': row['fertilizer_frequency'],
                    'pesticide_type': row['pesticide_type'],
                    'pesticide_frequency': row['pesticide_frequency'],
                    'pruning_interval_months': min(row['plant_age_months'], 36),  # cap at 3 years
                    'shade_tree_present': row['shade_tree_present'],
                    'soil_ph': row['soil_ph'],
                    'avg_temp_c': row['avg_temp_c'],
                    'avg_rainfall_mm': row['Avg_Rainfall_mm'],
                    'avg_humidity_pct': row['avg_humidity_pct'],
                    'elevation_m': row['elevation_m'],
                    'previous_yield_per_tree': row['previous_yield_per_tree'],
                    'previous_quality_score': row['previous_quality_score'],
                    'yield_trend': row['yield_trend'],
                    'target': target,
                    'effectiveness_score': effectiveness_score
                })
    
    result_df = pd.DataFrame(records)
    print(f"Generated {len(result_df)} recommendation records")
    print(f"Target distribution:\n{result_df['target'].value_counts()}")
    
    return result_df


def prepare_features(df):
    """Prepare feature matrix for training"""
    print("Preparing features...")
    
    feature_cols = NUMERICAL_FEATURES + CATEGORICAL_FEATURES
    
    # Encode categorical features
    label_encoders = {}
    for col in CATEGORICAL_FEATURES:
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        label_encoders[col] = le
        print(f"  {col}: {le.classes_}")
    
    # Fill missing values
    df[feature_cols] = df[feature_cols].fillna(0)
    
    X = df[feature_cols]
    y = df['target'].astype(str)
    
    return X, y, label_encoders


def train_model(X_train, y_train):
    """Train Random Forest with hyperparameter tuning"""
    print("\nTraining Random Forest classifier...")
    
    # Use a smaller parameter grid for faster training
    param_grid = {
        'n_estimators': [100, 150],
        'max_depth': [10, 15, 20],
        'min_samples_split': [2, 5],
        'min_samples_leaf': [1, 2]
    }
    
    # Base model
    rf = RandomForestClassifier(random_state=42, n_jobs=-1, class_weight='balanced')
    
    # Grid search with cross-validation
    grid_search = GridSearchCV(
        rf, 
        param_grid,
        cv=5,
        scoring='f1_weighted',
        n_jobs=-1,
        verbose=1
    )
    
    grid_search.fit(X_train, y_train)
    
    print(f"\nBest parameters: {grid_search.best_params_}")
    print(f"Best CV score: {grid_search.best_score_:.3f}")
    
    return grid_search.best_estimator_


def evaluate_model(model, X_test, y_test, label_encoder):
    """Evaluate model performance"""
    print("\nEvaluating model...")
    
    y_pred = model.predict(X_test)
    
    accuracy = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average='weighted')
    
    print(f"\n=== Model Evaluation ===")
    print(f"Accuracy: {accuracy:.3f}")
    print(f"F1 Score (weighted): {f1:.3f}")
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # Feature importance
    print("\nTop 10 Feature Importances:")
    feature_importance = pd.DataFrame({
        'feature': X_test.columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)
    
    for idx, row in feature_importance.head(10).iterrows():
        print(f"  {row['feature']}: {row['importance']:.4f}")
    
    return {
        'accuracy': float(accuracy),
        'f1_score': float(f1),
        'classification_report': classification_report(y_test, y_pred, output_dict=True),
        'feature_importance': feature_importance.head(10).to_dict('records')
    }


def export_to_onnx(model, feature_names, output_path):
    """Export model to ONNX format"""
    if not ONNX_AVAILABLE:
        print("SKIP: ONNX export not available (skl2onnx not installed)")
        return None
        
    print(f"\nExporting to ONNX format...")
    
    try:
        # Define input type
        initial_types = [('input', FloatTensorType([None, len(feature_names)]))]
        
        # Convert
        onnx_model = convert_sklearn(
            model,
            initial_types=initial_types,
            target_opset=12,
            options={'zipmap': False}
        )
        
        # Save
        with open(output_path, 'wb') as f:
            f.write(onnx_model.SerializeToString())
        
        print(f"ONNX model saved to: {output_path}")
        return output_path
    except Exception as e:
        print(f"ERROR exporting to ONNX: {e}")
        return None


def save_model_artifacts(model, metrics, label_encoders):
    """Save model and metrics"""
    print("\nSaving model artifacts...")
    
    # Ensure model directory exists
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    # Save joblib model with metadata
    model_data = {
        'model': model,
        'label_encoders': label_encoders,
        'numerical_features': NUMERICAL_FEATURES,
        'categorical_features': CATEGORICAL_FEATURES,
        'recommendation_types': RECOMMENDATION_TYPES,
        'training_date': pd.Timestamp.now().isoformat(),
        'metrics': metrics
    }
    
    joblib.dump(model_data, OUTPUT_JOBLIB)
    print(f"Joblib model saved to: {OUTPUT_JOBLIB}")
    
    # Save metrics
    with open(METRICS_FILE, 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f"Metrics saved to: {METRICS_FILE}")
    
    return OUTPUT_JOBLIB


def main():
    print("=" * 60)
    print("Phase 2: Recommendation Model Training")
    print("=" * 60)
    
    # Step 1: Load data
    df = load_and_prepare_data()
    
    # Step 2: Generate recommendation targets
    df_targets = generate_recommendation_targets(df)
    
    # Step 3: Prepare features
    X, y, label_encoders = prepare_features(df_targets)
    
    print(f"\nTraining set size: {len(X)}")
    print(f"Class distribution:\n{y.value_counts()}")
    
    # Step 4: Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"Train size: {len(X_train)}, Test size: {len(X_test)}")
    
    # Step 5: Train model
    model = train_model(X_train, y_train)
    
    # Step 6: Evaluate
    metrics = evaluate_model(model, X_test, y_test, label_encoders)
    
    # Step 7: Export to ONNX
    export_to_onnx(model, X.columns.tolist(), OUTPUT_ONNX)
    
    # Step 8: Save artifacts
    save_model_artifacts(model, metrics, label_encoders)
    
    print("\n" + "=" * 60)
    print("Training Complete!")
    print("=" * 60)
    print(f"\nModel file: {OUTPUT_JOBLIB}")
    if os.path.exists(OUTPUT_ONNX):
        print(f"ONNX file: {OUTPUT_ONNX}")
    print(f"Metrics: {METRICS_FILE}")


if __name__ == '__main__':
    main()
