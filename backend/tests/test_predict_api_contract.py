import unittest

from fastapi.testclient import TestClient

from backend.predict_api import app


def build_sample_features(overrides=None):
    sample = {
        "farm_id": "farm001",
        "cluster_id": "fm001cl001",
        "farm_size_ha": 1.8,
        "elevation_m": 720,
        "farm_cluster_count": 4,
        "cluster_plant_share_pct": 25.0,
        "cluster_tree_density_per_sqm": 0.28,
        "plant_age_years": 5,
        "number_of_plants": 420,
        "fertilizer_type": "organic",
        "fertilizer_frequency": "often",
        "pesticide_type": "organic",
        "pesticide_frequency": "sometimes",
        "pruning_interval_months": 6,
        "shade_tree_present": "yes",
        "soil_ph": 6.2,
        "avg_temp_c": 24.4,
        "avg_rainfall_mm": 210,
        "avg_humidity_pct": 77,
        "flood_risk_level": "low",
        "flood_events_count": 0,
        "pre_total_trees": 430,
        "pre_yield_kg": 430,
        "pre_grade_fine": 36,
        "pre_grade_premium": 34,
        "pre_grade_commercial": 30,
        "previous_fine_pct": 36,
        "previous_premium_pct": 34,
        "previous_commercial_pct": 30,
        "bean_size_mm": 7.0,
        "bean_screen_size": "large",
        "bean_moisture": 11.6,
        "defect_black_pct": 1.1,
        "defect_mold_infested_pct": 0.4,
        "defect_immature_pct": 1.9,
        "defect_broken_pct": 1.6,
        "defect_dried_cherries_pct": 0.8,
        "defect_foreign_matter_pct": 0.2,
        "pns_total_defects_pct": 6.0,
    }
    if overrides:
        sample.update(overrides)
    return sample


class PredictApiContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_contract(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("ok", payload)
        self.assertTrue(payload["ok"])
        self.assertIn("expected_features", payload)

    def test_predict_contract(self):
        response = self.client.post("/predict", json={"features": build_sample_features()})
        self.assertEqual(response.status_code, 200)
        body = response.json()

        expected_keys = {
            "yield_kg",
            "fine_grade_pct",
            "premium_grade_pct",
            "commercial_grade_pct",
            "dominant_grade",
            "grade_label",
        }
        self.assertTrue(expected_keys.issubset(body.keys()))

        self.assertIsInstance(body["yield_kg"], (int, float))
        self.assertIsInstance(body["fine_grade_pct"], (int, float))
        self.assertIsInstance(body["premium_grade_pct"], (int, float))
        self.assertIsInstance(body["commercial_grade_pct"], (int, float))
        self.assertIsInstance(body["dominant_grade"], str)
        self.assertIsInstance(body["grade_label"], str)

        grades_total = body["fine_grade_pct"] + body["premium_grade_pct"] + body["commercial_grade_pct"]
        self.assertAlmostEqual(grades_total, 100.0, delta=0.2)

    def test_predict_batch_contract(self):
        samples = [
            {"id": "sample-1", "features": build_sample_features()},
            {"id": "sample-2", "features": build_sample_features({"flood_risk_level": "medium", "flood_events_count": 2})},
        ]
        response = self.client.post("/predict/batch", json={"samples": samples})
        self.assertEqual(response.status_code, 200)

        body = response.json()
        self.assertIn("predictions", body)
        predictions = body["predictions"]
        self.assertEqual(len(predictions), 2)

        for expected_id, item in zip(("sample-1", "sample-2"), predictions):
            self.assertEqual(item.get("id"), expected_id)
            prediction = item.get("prediction", {})
            self.assertIn("yield_kg", prediction)
            self.assertIn("fine_grade_pct", prediction)
            self.assertIn("premium_grade_pct", prediction)
            self.assertIn("commercial_grade_pct", prediction)
            self.assertIn("dominant_grade", prediction)
            self.assertIn("grade_label", prediction)


if __name__ == "__main__":
    unittest.main()
