import os
import joblib
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Ensure the output directory exists
os.makedirs('public/models', exist_ok=True)

# Define the input type and shape (22 features based on FEATURE_KEYS in api/index.py)
initial_type = [('float_input', FloatTensorType([None, 22]))]

models_to_convert = [
    'trained_grade_model_commercial_grade_pct.joblib',
    'trained_grade_model_fine_grade_pct.joblib',
    'trained_grade_model_premium_grade_pct.joblib',
    'trained_yield_model_RF.joblib'
]

for model_file in models_to_convert:
    model_path = os.path.join('ml_models', model_file)
    if not os.path.exists(model_path):
        print(f"Warning: {model_path} not found. Skipping.")
        continue
        
    print(f"Converting {model_file}...")
    
    # Load the scikit-learn model
    model = joblib.load(model_path)
    
    # Convert to ONNX
    onnx_model = convert_sklearn(model, initial_types=initial_type)
    
    # Save the ONNX model
    onnx_filename = model_file.replace('.joblib', '.onnx')
    output_path = os.path.join('public/models', onnx_filename)
    
    with open(output_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())
        
    print(f"Saved to {output_path}")

print("All models converted successfully!")
