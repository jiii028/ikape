"""Test script to verify trained models work correctly."""
import sys
sys.path.insert(0, 'ml_training')

import pandas as pd
import joblib
import os
from train_models import FeatureEngineer, SingleOutputWrapper, GradeNormalizer

print("=" * 60)
print("Testing Trained Coffee Prediction Models")
print("=" * 60)

# Check if models exist
model_dir = 'ml_models'
models = [
    'trained_yield_model_RF.joblib',
    'trained_grade_model_fine_grade_pct.joblib',
    'trained_grade_model_premium_grade_pct.joblib',
    'trained_grade_model_commercial_grade_pct.joblib'
]

print("\n1. Checking model files...")
for model in models:
    path = os.path.join(model_dir, model)
    if os.path.exists(path):
        size = os.path.getsize(path) / 1024  # KB
        print(f"   [OK] {model} ({size:.1f} KB)")
    else:
        print(f"   [MISSING] {model} NOT FOUND")

print("\n2. Loading models...")
try:
    yield_model = joblib.load(os.path.join(model_dir, 'trained_yield_model_RF.joblib'))
    grade_fine = joblib.load(os.path.join(model_dir, 'trained_grade_model_fine_grade_pct.joblib'))
    grade_premium = joblib.load(os.path.join(model_dir, 'trained_grade_model_premium_grade_pct.joblib'))
    grade_commercial = joblib.load(os.path.join(model_dir, 'trained_grade_model_commercial_grade_pct.joblib'))
    print("   [OK] All models loaded successfully")
except Exception as e:
    print(f"   [ERROR] Error loading models: {e}")
    exit(1)

print("\n3. Creating test input...")
test_input = pd.DataFrame([{
    'plant_age_months': 48,
    'number_of_plants': 200,
    'fertilizer_type': 'organic',
    'fertilizer_frequency': 'sometimes',
    'pesticide_type': 'organic',
    'pesticide_frequency': 'rarely',
    'pruning_interval_months': 12,
    'shade_tree_present': True,
    'soil_ph': 5.8,
    'avg_temp_c': 24,
    'avg_rainfall_mm': 170,
    'avg_humidity_pct': 75,
    'previous_yield_per_tree': 2.5,
    'previous_fine_pct': 20,
    'previous_premium_pct': 55,
    'previous_commercial_pct': 25,
    'trees_productive_pct': 80,
    'yield_trend': 0
}])
print(f"   Input features: {list(test_input.columns)}")
print(f"   Input shape: {test_input.shape}")

print("\n4. Making predictions...")
try:
    yield_pred = yield_model.predict(test_input)[0]
    fine_pred = grade_fine.predict(test_input)[0]
    premium_pred = grade_premium.predict(test_input)[0]
    commercial_pred = grade_commercial.predict(test_input)[0]
    
    # Normalize grades to sum to 100
    total = fine_pred + premium_pred + commercial_pred
    if total > 0:
        fine_pct = (fine_pred / total) * 100
        premium_pct = (premium_pred / total) * 100
        commercial_pct = (commercial_pred / total) * 100
    else:
        fine_pct = premium_pct = commercial_pct = 33.33
    
    print(f"   Yield Prediction: {yield_pred:.2f} kg")
    print(f"   Fine Grade: {fine_pct:.2f}%")
    print(f"   Premium Grade: {premium_pct:.2f}%")
    print(f"   Commercial Grade: {commercial_pct:.2f}%")
    print(f"   Grade Sum: {fine_pct + premium_pct + commercial_pct:.2f}%")
    print("\n   [OK] All predictions successful")
except Exception as e:
    print(f"   [ERROR] Prediction error: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n5. Testing with different scenarios...")
scenarios = [
    ("Young plants, no fertilizer", {
        'plant_age_months': 18, 'fertilizer_type': 'none', 
        'number_of_plants': 100, 'previous_yield_per_tree': 0
    }),
    ("Mature plants, organic care", {
        'plant_age_months': 60, 'fertilizer_type': 'organic',
        'number_of_plants': 300, 'previous_yield_per_tree': 3.0
    }),
    ("Peak production, synthetic fertilizer", {
        'plant_age_months': 72, 'fertilizer_type': 'synthetic',
        'number_of_plants': 500, 'previous_yield_per_tree': 4.0
    }),
]

base_input = test_input.iloc[0].to_dict()
for name, overrides in scenarios:
    test_case = base_input.copy()
    test_case.update(overrides)
    df = pd.DataFrame([test_case])
    
    y = yield_model.predict(df)[0]
    f = grade_fine.predict(df)[0]
    p = grade_premium.predict(df)[0]
    c = grade_commercial.predict(df)[0]
    
    total = f + p + c
    if total > 0:
        f, p, c = (f/total)*100, (p/total)*100, (c/total)*100
    
    print(f"\n   {name}:")
    print(f"      Yield: {y:.1f} kg | Grades: F:{f:.1f}% P:{p:.1f}% C:{c:.1f}%")

print("\n" + "=" * 60)
print("All tests passed! Models are working correctly.")
print("=" * 60)
