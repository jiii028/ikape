"""
Synthetic Data Generator for Coffee Yield and Grade Prediction Models

This module generates high-fidelity synthetic training data that mirrors
the real-world coffee production context of the iKape system.

Based on Philippine Robusta coffee production parameters and agronomic research.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
import json

np.random.seed(42)


class CoffeeProductionSimulator:
    """
    Simulates coffee production based on agronomic and environmental factors.
    Uses realistic parameters for Philippine Robusta coffee cultivation.
    """
    
    # Philippine Robusta production parameters
    PRODUCTIVITY_CURVE = {
        'establishment': (0, 12, 0.0),      # 0-12 months: non-productive
        'young': (12, 24, 0.25),            # 12-24 months: 25% productivity
        'maturing': (24, 48, 0.60),         # 24-48 months: 60% productivity
        'peak': (48, 84, 1.0),              # 48-84 months: 100% productivity (peak)
        'mature': (84, 120, 0.85),          # 84-120 months: 85% productivity
        'aging': (120, 180, 0.70),          # 120-180 months: 70% productivity
        'old': (180, 300, 0.55),            # 180+ months: 55% productivity
    }
    
    YIELD_PER_TREE_BASELINE = 3.0  # kg of cherries per tree at peak
    
    # Environmental factors impact (multipliers)
    ENVIRONMENTAL_FACTORS = {
        'soil_ph': {
            'optimal_range': (5.0, 6.5),
            'suboptimal_penalty': 0.85,
            'poor_penalty': 0.75,
        },
        'temperature': {
            'optimal_range': (18, 28),
            'suboptimal_penalty': 0.90,
            'extreme_penalty': 0.80,
        },
        'rainfall': {
            'optimal_range': (125, 210),  # Monthly mm (1500-2500 annually)
            'drought_penalty': 0.75,
            'excess_penalty': 0.90,
        },
        'humidity': {
            'optimal_range': (60, 80),
            'suboptimal_penalty': 0.95,
        }
    }
    
    # Agronomic practice impact
    AGRONOMIC_FACTORS = {
        'fertilizer': {
            'none': 0.65,
            'organic': 1.0,
            'synthetic': 1.20,
        },
        'fertilizer_frequency': {
            'never': 0.70,
            'rarely': 0.85,
            'sometimes': 1.0,
            'often': 1.15,
        },
        'pesticide': {
            'none': 0.90,  # Some loss to pests
            'organic': 0.95,
            'synthetic': 1.0,
        },
        'pesticide_frequency': {
            'never': 0.95,
            'rarely': 0.98,
            'sometimes': 1.0,
            'often': 1.0,
        },
        'pruning': {
            'none': 0.80,
            'biennial': 1.0,
            'annual': 1.10,
        },
        'shade': {
            'none': 0.90,
            'present': 1.0,
        }
    }
    
    # Grade distribution baselines (Fine, Premium, Commercial)
    GRADE_BASELINES = {
        'fine': 0.20,      # 20%
        'premium': 0.55,   # 55%
        'commercial': 0.25 # 25%
    }
    
    def __init__(self, n_samples: int = 5000):
        self.n_samples = n_samples
        
    def _get_productivity_factor(self, age_months: int) -> float:
        """Calculate productivity factor based on plant age."""
        for stage, (min_age, max_age, factor) in self.PRODUCTIVITY_CURVE.items():
            if min_age <= age_months < max_age:
                # Add some noise within the stage
                noise = np.random.normal(0, 0.05)
                return max(0, min(1, factor + noise))
        # Default for very old trees
        return 0.50
    
    def _calculate_environmental_factor(self, 
                                       soil_ph: float,
                                       temp: float,
                                       rainfall: float,
                                       humidity: float) -> float:
        """Calculate combined environmental impact factor."""
        factor = 1.0
        
        # Soil pH factor
        ph_opt = self.ENVIRONMENTAL_FACTORS['soil_ph']['optimal_range']
        if not (ph_opt[0] <= soil_ph <= ph_opt[1]):
            if 4.5 <= soil_ph < ph_opt[0] or ph_opt[1] < soil_ph <= 7.5:
                factor *= self.ENVIRONMENTAL_FACTORS['soil_ph']['suboptimal_penalty']
            else:
                factor *= self.ENVIRONMENTAL_FACTORS['soil_ph']['poor_penalty']
        
        # Temperature factor
        temp_opt = self.ENVIRONMENTAL_FACTORS['temperature']['optimal_range']
        if not (temp_opt[0] <= temp <= temp_opt[1]):
            if 15 <= temp < temp_opt[0] or temp_opt[1] < temp <= 32:
                factor *= self.ENVIRONMENTAL_FACTORS['temperature']['suboptimal_penalty']
            else:
                factor *= self.ENVIRONMENTAL_FACTORS['temperature']['extreme_penalty']
        
        # Rainfall factor
        rain_opt = self.ENVIRONMENTAL_FACTORS['rainfall']['optimal_range']
        if rainfall < rain_opt[0]:
            factor *= self.ENVIRONMENTAL_FACTORS['rainfall']['drought_penalty']
        elif rainfall > rain_opt[1]:
            factor *= self.ENVIRONMENTAL_FACTORS['rainfall']['excess_penalty']
        
        # Humidity factor
        hum_opt = self.ENVIRONMENTAL_FACTORS['humidity']['optimal_range']
        if not (hum_opt[0] <= humidity <= hum_opt[1]):
            factor *= self.ENVIRONMENTAL_FACTORS['humidity']['suboptimal_penalty']
        
        return factor
    
    def _calculate_agronomic_factor(self,
                                   fertilizer_type: str,
                                   fertilizer_freq: str,
                                   pesticide_type: str,
                                   pesticide_freq: str,
                                   pruning_interval: int,
                                   shade_present: bool) -> float:
        """Calculate combined agronomic practice impact factor."""
        factor = 1.0
        
        # Fertilizer impact
        factor *= self.AGRONOMIC_FACTORS['fertilizer'].get(fertilizer_type, 1.0)
        factor *= self.AGRONOMIC_FACTORS['fertilizer_frequency'].get(fertilizer_freq, 1.0)
        
        # Pesticide impact
        factor *= self.AGRONOMIC_FACTORS['pesticide'].get(pesticide_type, 1.0)
        factor *= self.AGRONOMIC_FACTORS['pesticide_frequency'].get(pesticide_freq, 1.0)
        
        # Pruning impact
        if pruning_interval <= 12:
            pruning_impact = self.AGRONOMIC_FACTORS['pruning']['annual']
        elif pruning_interval <= 24:
            pruning_impact = self.AGRONOMIC_FACTORS['pruning']['biennial']
        else:
            pruning_impact = self.AGRONOMIC_FACTORS['pruning']['none']
        factor *= pruning_impact
        
        # Shade impact
        shade_key = 'present' if shade_present else 'none'
        factor *= self.AGRONOMIC_FACTORS['shade'][shade_key]
        
        return factor
    
    def _calculate_yield(self, features: Dict) -> float:
        """Calculate final yield based on all factors."""
        # Base yield calculation
        productivity = self._get_productivity_factor(features['plant_age_months'])
        base_yield = (productivity * 
                     features['number_of_plants'] * 
                     self.YIELD_PER_TREE_BASELINE)
        
        # Apply environmental factors
        env_factor = self._calculate_environmental_factor(
            features['soil_ph'],
            features['avg_temp_c'],
            features['avg_rainfall_mm'],
            features['avg_humidity_pct']
        )
        
        # Apply agronomic factors
        agro_factor = self._calculate_agronomic_factor(
            features['fertilizer_type'],
            features['fertilizer_frequency'],
            features['pesticide_type'],
            features['pesticide_frequency'],
            features['pruning_interval_months'],
            features['shade_tree_present']
        )
        
        # Historical trend factor (based on previous performance)
        trend_factor = 1.0 + (features['yield_trend'] * 0.10)
        
        # Tree productivity factor
        tree_factor = features['trees_productive_pct'] / 100.0
        
        # Calculate final yield with noise
        noise = np.random.normal(1.0, 0.08)  # 8% random variation
        final_yield = (base_yield * env_factor * agro_factor * 
                      trend_factor * tree_factor * noise)
        
        return max(0, final_yield)
    
    def _calculate_grades(self, features: Dict, yield_kg: float) -> Tuple[float, float, float]:
        """Calculate grade distribution percentages."""
        # Base grade distribution
        fine_base = self.GRADE_BASELINES['fine']
        premium_base = self.GRADE_BASELINES['premium']
        commercial_base = self.GRADE_BASELINES['commercial']
        
        # Quality modifiers
        quality_factor = 1.0
        
        # Organic fertilizer tends to produce better cupping scores
        if features['fertilizer_type'] == 'organic':
            quality_factor += 0.10
        elif features['fertilizer_type'] == 'none':
            quality_factor -= 0.10
        
        # Shade improves bean density and cup quality
        if features['shade_tree_present']:
            quality_factor += 0.08
        
        # Environmental stress reduces quality
        temp = features['avg_temp_c']
        if temp > 30 or temp < 15:
            quality_factor -= 0.05
        
        if features['avg_rainfall_mm'] > 250 or features['avg_rainfall_mm'] < 100:
            quality_factor -= 0.05
        
        # Proper pruning improves quality
        if features['pruning_interval_months'] <= 12:
            quality_factor += 0.05
        
        # Plant age affects quality (older trees more consistent but declining peak)
        age = features['plant_age_months']
        if age > 120:
            quality_factor -= 0.05
        
        # Apply quality factor (shifts distribution toward premium/fine)
        fine_pct = fine_base * quality_factor
        premium_pct = premium_base * quality_factor
        commercial_pct = max(0.05, 1.0 - fine_pct - premium_pct)  # Ensure minimum commercial
        
        # Normalize to ensure sum = 1.0
        total = fine_pct + premium_pct + commercial_pct
        fine_pct = (fine_pct / total) * 100
        premium_pct = (premium_pct / total) * 100
        commercial_pct = (commercial_pct / total) * 100
        
        # Add small random variation
        fine_pct += np.random.normal(0, 1.5)
        premium_pct += np.random.normal(0, 2.0)
        commercial_pct = 100 - fine_pct - premium_pct
        
        return (
            max(0, min(100, fine_pct)),
            max(0, min(100, premium_pct)),
            max(0, min(100, commercial_pct))
        )
    
    def _generate_single_sample(self) -> Dict:
        """Generate a single synthetic sample."""
        # Agronomic features
        plant_age_months = int(np.random.choice([
            np.random.randint(6, 24),    # Young
            np.random.randint(24, 60),   # Maturing
            np.random.randint(60, 96),   # Peak
            np.random.randint(96, 144),  # Mature
            np.random.randint(144, 240), # Aging
        ], p=[0.15, 0.20, 0.35, 0.20, 0.10]))
        
        number_of_plants = int(np.random.choice([
            np.random.randint(50, 150),
            np.random.randint(150, 400),
            np.random.randint(400, 800),
            np.random.randint(800, 1500),
        ], p=[0.20, 0.35, 0.30, 0.15]))
        
        fertilizer_type = np.random.choice(['organic', 'synthetic', 'none'], p=[0.45, 0.40, 0.15])
        fertilizer_frequency = np.random.choice(['never', 'rarely', 'sometimes', 'often'], 
                                                p=[0.10, 0.25, 0.40, 0.25])
        
        pesticide_type = np.random.choice(['organic', 'synthetic', 'none'], p=[0.30, 0.45, 0.25])
        pesticide_frequency = np.random.choice(['never', 'rarely', 'sometimes', 'often'],
                                               p=[0.20, 0.35, 0.30, 0.15])
        
        pruning_interval_months = int(np.random.choice([6, 12, 18, 24, 36], 
                                                       p=[0.10, 0.40, 0.25, 0.15, 0.10]))
        
        shade_tree_present = np.random.choice([True, False], p=[0.65, 0.35])
        
        # Environmental features (Philippine context)
        # Typical coffee-growing regions: Benguet, Sagada, Batangas, Cavite
        soil_ph = np.random.normal(5.8, 0.6)
        soil_ph = max(4.0, min(8.0, soil_ph))
        
        avg_temp_c = np.random.normal(24, 3)
        avg_temp_c = max(15, min(32, avg_temp_c))
        
        avg_rainfall_mm = np.random.normal(170, 40)  # Monthly average
        avg_rainfall_mm = max(50, min(350, avg_rainfall_mm))
        
        avg_humidity_pct = np.random.normal(75, 10)
        avg_humidity_pct = max(40, min(95, avg_humidity_pct))
        
        # Historical features
        previous_yield_per_tree = np.random.uniform(0.5, 5.0)
        previous_fine_pct = np.random.uniform(10, 35)
        previous_premium_pct = np.random.uniform(40, 70)
        previous_commercial_pct = 100 - previous_fine_pct - previous_premium_pct
        
        trees_productive_pct = np.random.uniform(60, 95)
        yield_trend = np.random.choice([-1, 0, 1], p=[0.20, 0.55, 0.25])
        
        features = {
            'plant_age_months': plant_age_months,
            'number_of_plants': number_of_plants,
            'fertilizer_type': fertilizer_type,
            'fertilizer_frequency': fertilizer_frequency,
            'pesticide_type': pesticide_type,
            'pesticide_frequency': pesticide_frequency,
            'pruning_interval_months': pruning_interval_months,
            'shade_tree_present': shade_tree_present,
            'soil_ph': soil_ph,
            'avg_temp_c': avg_temp_c,
            'avg_rainfall_mm': avg_rainfall_mm,
            'avg_humidity_pct': avg_humidity_pct,
            'previous_yield_per_tree': previous_yield_per_tree,
            'previous_fine_pct': previous_fine_pct,
            'previous_premium_pct': previous_premium_pct,
            'previous_commercial_pct': previous_commercial_pct,
            'trees_productive_pct': trees_productive_pct,
            'yield_trend': yield_trend,
        }
        
        # Calculate targets
        yield_kg = self._calculate_yield(features)
        fine_pct, premium_pct, commercial_pct = self._calculate_grades(features, yield_kg)
        
        features['yield_kg'] = yield_kg
        features['fine_grade_pct'] = fine_pct
        features['premium_grade_pct'] = premium_pct
        features['commercial_grade_pct'] = commercial_pct
        
        return features
    
    def generate_dataset(self, n_samples: Optional[int] = None) -> pd.DataFrame:
        """Generate complete synthetic dataset."""
        n = n_samples or self.n_samples
        
        print(f"Generating {n} synthetic samples...")
        data = []
        for i in range(n):
            if (i + 1) % 1000 == 0:
                print(f"  Generated {i + 1}/{n} samples...")
            data.append(self._generate_single_sample())
        
        df = pd.DataFrame(data)
        print(f"Dataset generation complete!")
        return df
    
    def save_dataset(self, df: pd.DataFrame, filepath: str = 'synthetic_coffee_data.csv'):
        """Save dataset to CSV file."""
        df.to_csv(filepath, index=False)
        print(f"Dataset saved to {filepath}")
        
        # Print statistics
        print("\nDataset Statistics:")
        print(f"  Total samples: {len(df)}")
        print(f"  Yield (kg): mean={df['yield_kg'].mean():.2f}, std={df['yield_kg'].std():.2f}")
        print(f"  Fine grade %: mean={df['fine_grade_pct'].mean():.2f}, std={df['fine_grade_pct'].std():.2f}")
        print(f"  Premium grade %: mean={df['premium_grade_pct'].mean():.2f}, std={df['premium_grade_pct'].std():.2f}")
        print(f"  Commercial grade %: mean={df['commercial_grade_pct'].mean():.2f}, std={df['commercial_grade_pct'].std():.2f}")


if __name__ == '__main__':
    simulator = CoffeeProductionSimulator(n_samples=5000)
    df = simulator.generate_dataset()
    simulator.save_dataset(df, 'ikape/ml_training/synthetic_coffee_data.csv')
