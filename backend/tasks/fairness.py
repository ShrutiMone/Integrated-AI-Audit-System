# backend/tasks/fairness.py
# ─────────────────────────────────────────────────────────────────────────────
# LIVE MODULE — wraps the existing Fairlearn-based fairness analysis.
# Called by the orchestrator; receives file paths (not Flask request objects).
# ─────────────────────────────────────────────────────────────────────────────

import pandas as pd
import sys, os

# Ensure backend root is on path so utils imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.fairness_metrics import (
    compute_fairness_metrics,
    generate_user_specific_suggestions,
    compute_performance_metrics,
    analyze_data_quality,
)
from utils.mitigation import train_baseline_only, build_transformer
from utils.model_loader import load_model


def run_fairness(
    csv_path: str,
    target: str,
    sensitive: str,
    pred_col=None,
    train_baseline=True,
    model_path=None,
    wrap_model=False,
    dp_threshold=0.1,
    eo_threshold=0.1,
    fpr_threshold=0.1,
    fnr_threshold=0.1,
    **kwargs,          # absorb unused params from orchestrator
) -> dict:
    """
    Run full fairness analysis. Returns a serialisable dict.
    Raises on failure — orchestrator catches and marks module as error.
    """
    if not target or not sensitive:
        raise ValueError("Fairness module requires 'target' and 'sensitive' columns.")

    df = pd.read_csv(csv_path)

    # ── determine prediction source ───────────────────────────────────────
    if model_path:
        with open(model_path, "rb") as fh:
            class _FakeFile:
                def __init__(self, path):
                    self._path = path
                    self.filename = os.path.basename(path)
                def read(self):
                    with open(self._path, "rb") as f: return f.read()
                def seek(self, n): pass

            model, is_dl = load_model(_FakeFile(model_path), os.path.basename(model_path))

        if hasattr(model, "predict_with_sensitive"):
            df["y_pred"] = model.predict_with_sensitive(
                df, target_col=target, sensitive_col=sensitive)
        else:
            feat_cols = [c for c in df.columns if c not in (target, sensitive)]
            X = df[feat_cols]
            if wrap_model:
                # transformer = build_transformer(X)
                transformer, _strategy, _te = build_transformer(df, target, sensitive)
                X = transformer.fit_transform(X)
            df["y_pred"] = model.predict(X)
        pred_col = "y_pred"
    elif train_baseline:
        # clf = train_baseline_only(df, target, sensitive)
        baseline_res = train_baseline_only(df, target, sensitive)
        clf = baseline_res.get("pipeline")
        if clf is None:
            raise ValueError("Baseline training did not return a trained pipeline.")
        feat_cols = [c for c in df.columns if c not in (target, sensitive)]
        df["y_pred"] = clf.predict(df[feat_cols])
        pred_col = "y_pred"
        is_dl = False
    elif pred_col and pred_col in df.columns:
        is_dl = False
    else:
        raise ValueError(
            "Fairness: no prediction source. Upload a model, provide a "
            "prediction column, or enable baseline training."
        )

    # ── compute metrics ───────────────────────────────────────────────────
    res = compute_fairness_metrics(df, target, sensitive, pred_col=pred_col)
    suggestions = generate_user_specific_suggestions(
        df, res, target, sensitive,
        dp_threshold=dp_threshold, eo_threshold=eo_threshold,
        fpr_threshold=fpr_threshold, fnr_threshold=fnr_threshold,
    )
    perf = compute_performance_metrics(df[target], df[pred_col])
    dq   = analyze_data_quality(df, target, sensitive)

    return {
        **res,
        "suggestions":   suggestions,
        "performance":   perf,
        "data_quality":  dq,
        "is_dl_model":   is_dl if model_path else False,
        "module":        "fairness",
        "status":        "ok",
    }
