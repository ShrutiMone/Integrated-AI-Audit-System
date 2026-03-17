# backend/tasks/energy.py
# ─────────────────────────────────────────────────────────────────────────────
# PLACEHOLDER — Replace with the real CodeCarbon energy tracking logic.
#
# CONTRACT (keep this signature):
#   run_energy(csv_path, target, sensitive, model_path, **kwargs) -> dict
#
# SUGGESTED IMPLEMENTATION NOTES:
#   from codecarbon import EmissionsTracker
#
#   tracker = EmissionsTracker(project_name="ai_audit", output_dir="./emissions")
#   tracker.start()
#   ... run your model training / inference here ...
#   emissions = tracker.stop()   # kg CO₂ equivalent
#
#   - Track emissions during model training AND inference
#   - Compare training vs inference footprint
#   - Return emissions_kg, energy_kwh, duration_s, hardware_info, equivalents
#     (e.g. "equivalent to X km driven")
# ─────────────────────────────────────────────────────────────────────────────

import pandas as pd
import time


def run_energy(
    csv_path: str,
    target: str = "",
    sensitive: str = "",
    model_path=None,
    **kwargs,
) -> dict:
    """
    PLACEHOLDER — returns a stub result so the unified report renders.
    Replace the body of this function with real CodeCarbon logic.
    """

    # ── TODO: replace below with real implementation ───────────────────────
    time.sleep(1)   # simulate work; remove when real logic is added

    df = pd.read_csv(csv_path)

    return {
        "module":  "energy",
        "status":  "placeholder",
        "message": (
            "Energy efficiency module not yet implemented. "
            "Replace backend/tasks/energy.py with your CodeCarbon code."
        ),
        "placeholder_data": {
            "num_rows":       int(df.shape[0]),
            "emissions_kg":   None,
            "energy_kwh":     None,
            "duration_s":     None,
            "hardware_info":  {},
            "equivalents":    {},
        },
    }
    # ── END TODO ────────────────────────────────────────────────────────────
