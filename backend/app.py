# backend/app.py
# ─────────────────────────────────────────────────────────────────────────────
# Orchestrator: receives audit requests, fans out tasks per selected module,
# polls progress, assembles unified report.
# Fairness module is LIVE. Explainability, Compliance, Energy are placeholders.
# ─────────────────────────────────────────────────────────────────────────────

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os, uuid, json
from datetime import datetime
from threading import Thread

from tasks.fairness      import run_fairness
from tasks.explainability import run_explainability
from tasks.compliance    import run_compliance
from tasks.energy        import run_energy
from report.generator    import generate_unified_report

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:5000").rstrip("/")

# ── in-memory job store ────────────────────────────────────────────────────
# job_id → { modules, status, module_status, module_results, created_at }
JOBS = {}

app = Flask(__name__)
CORS(app)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs("saved_models_fairness", exist_ok=True)


# ── module registry ────────────────────────────────────────────────────────
MODULE_RUNNERS = {
    "fairness":       run_fairness,
    "explainability": run_explainability,
    "compliance":     run_compliance,
    "energy":         run_energy,
}


# ── helpers ────────────────────────────────────────────────────────────────

def _save_upload(file_obj, suffix=""):
    """Save an uploaded file to disk and return its path."""
    fname = f"{uuid.uuid4()}{suffix}"
    path = os.path.join(UPLOAD_DIR, fname)
    file_obj.save(path)
    return path


def _module_worker(job_id, module_name, runner, kwargs):
    """Thread target: run one module, write result back to JOBS."""
    job = JOBS[job_id]
    job["module_status"][module_name] = "running"
    try:
        result = runner(**kwargs)
        job["module_results"][module_name] = result
        job["module_status"][module_name] = "done"
    except Exception as exc:
        job["module_results"][module_name] = {"error": str(exc)}
        job["module_status"][module_name] = "error"
    finally:
        _check_job_complete(job_id)


def _check_job_complete(job_id):
    """Mark job done/partial once all modules have finished."""
    job = JOBS[job_id]
    statuses = list(job["module_status"].values())
    if all(s in ("done", "error") for s in statuses):
        job["status"] = "done"


# ── endpoints ──────────────────────────────────────────────────────────────

@app.route("/audit/start", methods=["POST"])
def audit_start():
    """
    POST multipart/form-data
      file          – CSV dataset (required)
      modules       – comma-separated list: fairness,explainability,compliance,energy
      target        – target column name        (fairness / explainability)
      sensitive     – sensitive attribute column (fairness)
      pred_col      – optional prediction column
      train_baseline– "1" / "0"
      user_model    – optional model file upload
    """
    if "file" not in request.files:
        return jsonify({"error": "No CSV file uploaded"}), 400

    modules_raw = request.form.get("modules", "fairness")
    selected_modules = [m.strip() for m in modules_raw.split(",") if m.strip() in MODULE_RUNNERS]
    if not selected_modules:
        return jsonify({"error": "No valid modules selected"}), 400

    # Save uploaded files
    csv_path = _save_upload(request.files["file"], ".csv")
    model_path = None
    if "user_model" in request.files:
        mf = request.files["user_model"]
        ext = os.path.splitext(mf.filename)[1]
        model_path = _save_upload(mf, ext)

    # Common form params
    params = {
        "csv_path":       csv_path,
        "target":         request.form.get("target", ""),
        "sensitive":      request.form.get("sensitive", ""),
        "pred_col":       request.form.get("pred_col") or None,
        "train_baseline": request.form.get("train_baseline", "1") in ("1", "true", "yes"),
        "model_path":     model_path,
        "wrap_model":     request.form.get("wrap_model", "0") in ("1", "true", "yes"),
        "dp_threshold":   float(request.form.get("dp_threshold", 0.1)),
        "eo_threshold":   float(request.form.get("eo_threshold", 0.1)),
        "fpr_threshold":  float(request.form.get("fpr_threshold", 0.1)),
        "fnr_threshold":  float(request.form.get("fnr_threshold", 0.1)),
    }

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "modules":         selected_modules,
        "status":          "running",
        "module_status":   {m: "queued" for m in selected_modules},
        "module_results":  {},
        "params":          params,
        "created_at":      datetime.now().isoformat(),
    }

    # Spawn one thread per module — true parallel execution
    for module_name in selected_modules:
        runner = MODULE_RUNNERS[module_name]
        t = Thread(
            target=_module_worker,
            args=(job_id, module_name, runner, params),
            daemon=True,
        )
        t.start()

    return jsonify({"job_id": job_id, "modules": selected_modules})


@app.route("/audit/status/<job_id>", methods=["GET"])
def audit_status(job_id):
    """Returns per-module progress and overall job status."""
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify({
        "job_id":        job_id,
        "status":        job["status"],
        "module_status": job["module_status"],
    })


@app.route("/audit/result/<job_id>", methods=["GET"])
def audit_result(job_id):
    """Returns full results once job is done."""
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if job["status"] != "done":
        return jsonify({"error": "Job not finished yet", "status": job["status"]}), 202
    return jsonify({
        "job_id":         job_id,
        "module_results": job["module_results"],
        "modules":        job["modules"],
    })


@app.route("/audit/report/<job_id>", methods=["GET"])
def audit_report(job_id):
    """Generate and download a unified HTML report."""
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    if job["status"] != "done":
        return jsonify({"error": "Job not finished yet"}), 202

    report_path = generate_unified_report(job_id, job["module_results"], job["modules"])
    return send_file(report_path, as_attachment=True, download_name=f"audit_report_{job_id[:8]}.html")


# ── legacy fairness-only endpoints (keep your existing frontend working) ──

from utils.fairness_metrics import (
    compute_fairness_metrics, generate_user_specific_suggestions,
    compute_performance_metrics, analyze_data_quality,
)
from utils.mitigation import (
    mitigate_with_exponentiated_gradient, mitigate_user_model,
    train_baseline_only, build_transformer,
    MitigatedBaselineWrapper, MitigatedUserModelWrapper,
)
from utils.model_loader import load_model
import pandas as pd, joblib
from typing import Optional

PROGRESS = {}
RESULTS  = {}


def _run_analysis(df, target, sensitive, *, pred_col=None, train_baseline_flag=True,
                  user_model_file=None, wrap_model_flag=False,
                  dp_threshold=0.1, eo_threshold=0.1, fpr_threshold=0.1, fnr_threshold=0.1)-> dict:
    out = {}
    if user_model_file:
        model, is_dl = load_model(user_model_file, user_model_file.filename)
        out["is_dl_model"] = is_dl
        if hasattr(model, "predict_with_sensitive"):
            df["y_pred"] = model.predict_with_sensitive(df, target_col=target, sensitive_col=sensitive)
        else:
            feat_cols = [c for c in df.columns if c not in (target, sensitive)]
            X = df[feat_cols]
            if wrap_model_flag:
                # transformer = build_transformer(X)
                transformer, _strategy, _te = build_transformer(df, target, sensitive)
                X = transformer.fit_transform(X)
            df["y_pred"] = model.predict(X)
        pred_col = "y_pred"
    elif train_baseline_flag:
        # clf = train_baseline_only(df, target, sensitive)
        baseline_res = train_baseline_only(df, target, sensitive)
        clf = baseline_res.get("pipeline")
        if clf is None:
            raise ValueError("Baseline training did not return a trained pipeline.")
        feat_cols = [c for c in df.columns if c not in (target, sensitive)]
        df["y_pred"] = clf.predict(df[feat_cols])
        pred_col = "y_pred"
        out["is_dl_model"] = False
    elif pred_col and pred_col in df.columns:
        out["is_dl_model"] = False
    else:
        raise ValueError("No prediction source available.")
    res = compute_fairness_metrics(df, target, sensitive, pred_col=pred_col)
    suggestions = generate_user_specific_suggestions(df, res, target, sensitive,
        dp_threshold=dp_threshold, eo_threshold=eo_threshold,
        fpr_threshold=fpr_threshold, fnr_threshold=fnr_threshold)
    out.update(res)
    out["suggestions"] = suggestions
    out["is_dl_model"] = out.get("is_dl_model", False)
    out["performance"] = compute_performance_metrics(df[target], df[pred_col])
    out["data_quality"] = analyze_data_quality(df, target, sensitive)
    return out


def _parse_analysis_request(req):
    if "file" not in req.files:
        raise ValueError("No file uploaded")
    file = req.files["file"]
    target = req.form.get("target")
    sensitive = req.form.get("sensitive")
    if not target or not sensitive:
        raise ValueError("target and sensitive are required")
    df = pd.read_csv(file)
    kwargs = dict(
        pred_col=req.form.get("pred_col") or None,
        train_baseline_flag=req.form.get("train_baseline", "true").lower() in ("1","true","yes"),
        user_model_file=req.files.get("user_model") or None,
        wrap_model_flag=req.form.get("wrap_model","false").lower() in ("1","true","yes"),
        dp_threshold=float(req.form.get("dp_threshold", 0.1)),
        eo_threshold=float(req.form.get("eo_threshold", 0.1)),
        fpr_threshold=float(req.form.get("fpr_threshold", 0.1)),
        fnr_threshold=float(req.form.get("fnr_threshold", 0.1)),
    )
    return df, target, sensitive, kwargs


@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        df, target, sensitive, kwargs = _parse_analysis_request(request)
        out = _run_analysis(df, target, sensitive, **kwargs)
        return jsonify(out)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/export_report", methods=["POST"])
def export_report():
    import tempfile
    try:
        df, target, sensitive, kwargs = _parse_analysis_request(request)
        out = _run_analysis(df, target, sensitive, **kwargs)
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmpf:
            json.dump(out, tmpf, indent=2)
            tmp_path = tmpf.name
        return send_file(tmp_path, as_attachment=True, download_name="fairness_report.json")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/mitigate_async", methods=["POST"])
def mitigate_async():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        file = request.files["file"]
        target = request.form.get("target")
        sensitive = request.form.get("sensitive")
        constraint = request.form.get("constraint", "demographic_parity")
        if not target or not sensitive:
            return jsonify({"error": "target and sensitive are required"}), 400
        df = pd.read_csv(file)
        job_id = str(uuid.uuid4())
        PROGRESS[job_id] = {"status": "running", "percent": 0, "message": "queued"}

        def worker(df, target, sensitive, constraint, job_id):
            try:
                PROGRESS[job_id].update({"percent": 10, "message": "starting mitigation"})
                res = mitigate_with_exponentiated_gradient(df, target, sensitive, constraint=constraint)
                mitigator  = res.pop("mitigator")
                transformer = res.pop("transformer")
                label_encoder = res.pop("label_encoder")
                model_id = str(uuid.uuid4())
                model_path = os.path.join("saved_models_fairness", f"{model_id}.joblib")
                wrapper = MitigatedBaselineWrapper(
                    mitigator=mitigator, target_col=target, sensitive_col=sensitive,
                    metadata={"transformer": transformer, "label_encoder": label_encoder,
                              "constraint": constraint, "timestamp": datetime.now().isoformat()})
                joblib.dump(wrapper, model_path)
                res["model_id"] = model_id
                res["model_download_url"] = f"{BASE_URL}/download_model/{model_id}"
                PROGRESS[job_id].update({"percent": 100, "message": "done", "status": "done"})
                RESULTS[job_id] = res
            except Exception as exc:
                PROGRESS[job_id].update({"status": "failed", "message": str(exc)})
                RESULTS[job_id] = {"error": str(exc)}

        Thread(target=worker, args=(df, target, sensitive, constraint, job_id), daemon=True).start()
        return jsonify({"job_id": job_id})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/mitigate_user_model_async", methods=["POST"])
def mitigate_user_model_async():
    try:
        if "file" not in request.files or "user_model" not in request.files:
            return jsonify({"error": "file and user_model required"}), 400
        df = pd.read_csv(request.files["file"])
        target    = request.form.get("target")
        sensitive = request.form.get("sensitive")
        constraint = request.form.get("constraint", "demographic_parity")
        model_file = request.files["user_model"]
        model, _ = load_model(model_file, model_file.filename)
        job_id = str(uuid.uuid4())
        PROGRESS[job_id] = {"status": "running", "percent": 0, "message": "queued"}

        def worker(df, model, target, sensitive, constraint, job_id):
            try:
                PROGRESS[job_id].update({"percent": 10, "message": "mitigating user model"})
                res = mitigate_user_model(df, model, target, sensitive, constraint=constraint)
                final_model   = res.pop("final_model", None)
                transformer_u = res.pop("transformer", None)
                group_thresholds = res.pop("group_thresholds", {})
                model_id = str(uuid.uuid4())
                model_path = os.path.join("saved_models_fairness", f"{model_id}.joblib")
                wrapper = MitigatedUserModelWrapper(
                    final_model=final_model, transformer=transformer_u,
                    group_thresholds=group_thresholds, sensitive_col=sensitive,
                    target_col=target, constraint=constraint,
                    metadata={"timestamp": datetime.now().isoformat()})
                joblib.dump(wrapper, model_path)
                res["model_id"] = model_id
                res["model_download_url"] = f"{BASE_URL}/download_model/{model_id}"
                PROGRESS[job_id].update({"percent": 100, "message": "done", "status": "done"})
                RESULTS[job_id] = res
            except Exception as exc:
                PROGRESS[job_id].update({"status": "failed", "message": str(exc)})
                RESULTS[job_id] = {"error": str(exc)}

        Thread(target=worker, args=(df, model, target, sensitive, constraint, job_id), daemon=True).start()
        return jsonify({"job_id": job_id})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/progress/<job_id>", methods=["GET"])
def progress(job_id):
    return jsonify(PROGRESS.get(job_id, {"status": "not_found"}))


@app.route("/result/<job_id>", methods=["GET"])
def result(job_id):
    return jsonify(RESULTS.get(job_id, {"error": "not found"}))


@app.route("/download_model/<model_id>", methods=["GET"])
def download_model(model_id):
    path = os.path.join("saved_models_fairness", f"{model_id}.joblib")
    if not os.path.exists(path):
        return jsonify({"error": "Model not found"}), 404
    return send_file(path, as_attachment=True, download_name=f"mitigated_model_{model_id[:8]}.joblib")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
