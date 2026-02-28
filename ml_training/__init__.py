"""
ML Training Module for iKape Coffee Prediction System

This module provides:
- Synthetic data generation based on Philippine coffee production parameters
- Machine learning model training pipeline
- Model evaluation and validation
- Export to ONNX format for browser inference
"""

from .generate_synthetic_data import CoffeeProductionSimulator
from .train_models import CoffeeMLPipeline, ModelConfig

__all__ = ['CoffeeProductionSimulator', 'CoffeeMLPipeline', 'ModelConfig']
