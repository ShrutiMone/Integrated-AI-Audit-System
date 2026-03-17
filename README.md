# FairCheck AI — Unified Audit Suite

A multi-module AI auditing platform. Upload a dataset and model, select
the audit modules you want to run, and get a unified report.

---

## Project Structure

```
project/
├── backend/
│   ├── app.py                  ← Flask orchestrator (all API endpoints)
│   ├── requirements.txt
│   ├── tasks/
│   │   ├── fairness.py         ← LIVE (Fairlearn)
│   │   ├── explainability.py   ← PLACEHOLDER — replace with SHAP/LIME
│   │   ├── compliance.py       ← PLACEHOLDER — replace with Presidio
│   │   └── energy.py           ← PLACEHOLDER — replace with CodeCarbon
│   ├── report/
│   │   └── generator.py        ← Unified HTML report builder
│   └── utils/                  ← Existing fairness utilities (unchanged)
│       ├── fairness_metrics.py
│       ├── mitigation.py
│       └── model_loader.py
└── frontend/
    └── src/
        ├── App.js              ← Page router
        ├── theme.js
        ├── index.js / index.css
        ├── components/
        │   └── Navbar.jsx      ← Home | Audit | Fairness | Glossary
        ├── pages/
        │   ├── HomePage.jsx    ← Module selector + upload
        │   ├── AuditPage.jsx   ← Live parallel progress + results
        │   ├── FairnessPage.jsx← Deep fairness analysis + mitigation
        │   └── GlossaryPage.jsx← Static glossary of all terms
        └── utils/
            └── api.js          ← All API calls
```

---

## Setup

### Backend

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Flask runs on **http://127.0.0.1:5000**

### Frontend

```bash
cd frontend
npm install
npm start
```

React runs on **http://localhost:3000**

---

## New API Endpoints (Orchestrator)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/audit/start` | Start a multi-module job (returns `job_id`) |
| GET  | `/audit/status/:id` | Per-module status (`queued/running/done/error`) |
| GET  | `/audit/result/:id` | Full results once done |
| GET  | `/audit/report/:id` | Download unified HTML report |

The orchestrator fans out one thread per selected module — they run in
**true parallel**. The frontend polls `/audit/status/:id` every 1.2 s.

---

## How to Implement Your Module

Each module in `backend/tasks/` follows the same contract:

```python
def run_<module>(csv_path, target, sensitive, model_path=None, **kwargs) -> dict:
    """
    - csv_path:   path to the uploaded CSV on disk
    - target:     target column name (string)
    - sensitive:  sensitive attribute column name (string)
    - model_path: path to uploaded model file, or None
    - **kwargs:   absorb unused params from orchestrator
    
    Return a JSON-serialisable dict.
    Raise exceptions freely — orchestrator catches and marks module as error.
    """
```

### Explainability (`tasks/explainability.py`)

```python
import shap, pandas as pd
from utils.model_loader import load_model

def run_explainability(csv_path, target, **kwargs):
    df = pd.read_csv(csv_path)
    X  = df.drop(columns=[target])
    model, _ = load_model(...)  # use model_path from kwargs
    
    explainer   = shap.Explainer(model, X)
    shap_values = explainer(X)
    
    return {
        "module": "explainability",
        "status": "ok",
        "shap_mean_abs": dict(zip(X.columns, shap_values.abs.mean(0).values.tolist())),
        "top_features":  sorted(X.columns, key=lambda c: shap_values[:,c].abs.mean(), reverse=True)[:10],
    }
```

### Compliance (`tasks/compliance.py`)

```python
from presidio_analyzer import AnalyzerEngine
import pandas as pd

def run_compliance(csv_path, **kwargs):
    df      = pd.read_csv(csv_path)
    engine  = AnalyzerEngine()
    findings = {}
    
    for col in df.select_dtypes(include="object").columns:
        sample = df[col].dropna().astype(str).tolist()[:200]
        hits   = [engine.analyze(text=t, language="en") for t in sample]
        entity_types = [r.entity_type for row in hits for r in row]
        if entity_types:
            findings[col] = list(set(entity_types))
    
    return {
        "module":  "compliance",
        "status":  "ok",
        "pii_findings": findings,
        "columns_at_risk": list(findings.keys()),
        "risk_score": len(findings) / max(len(df.columns), 1),
    }
```

### Energy (`tasks/energy.py`)

```python
from codecarbon import EmissionsTracker
from utils.mitigation import train_baseline_only
import pandas as pd

def run_energy(csv_path, target, sensitive, **kwargs):
    df      = pd.read_csv(csv_path)
    tracker = EmissionsTracker(project_name="ai_audit", save_to_file=False)
    tracker.start()
    train_baseline_only(df, target, sensitive)
    emissions = tracker.stop()   # kg CO2eq
    
    return {
        "module":       "energy",
        "status":       "ok",
        "emissions_kg": emissions,
    }
```

---

## Report

Once all selected modules finish, the **Download Report** button appears on
the Audit page. The report is a self-contained HTML file that renders in
any browser — no server needed after download.

---

## Supported Model Formats

| Format | Analysis | Mitigation |
|--------|----------|------------|
| `.joblib` / `.pkl` | ✅ | ✅ |
| `.onnx`            | ✅ | ❌ |
| `.keras` / `.h5`   | ✅ | ❌ |
| `.pt` / `.pth`     | ✅ | ❌ |
