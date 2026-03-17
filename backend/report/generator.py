# backend/report/generator.py
# ─────────────────────────────────────────────────────────────────────────────
# Generates a self-contained HTML audit report from all module results.
# Each module section is rendered only if that module was selected.
# ─────────────────────────────────────────────────────────────────────────────

import os, json
from datetime import datetime

REPORT_DIR = "reports"
os.makedirs(REPORT_DIR, exist_ok=True)


def _fmt(val, decimals=4):
    if val is None: return "N/A"
    if isinstance(val, float): return f"{val:.{decimals}f}"
    return str(val)


def _score_color(val):
    if val is None: return "#6b7280"
    try:
        v = float(val)
        if abs(v) < 0.1: return "#22c55e"
        if abs(v) < 0.2: return "#f59e0b"
        return "#ef4444"
    except: return "#6b7280"


def _render_fairness(data: dict) -> str:
    overall = data.get("overall", {})
    by_group = data.get("by_group", {})
    perf = data.get("performance", {})
    dq = data.get("data_quality", {})
    suggestions = data.get("suggestions", [])

    if data.get("status") == "placeholder" or "error" in data:
        msg = data.get("error") or data.get("message", "No data")
        return f'<div class="module-error">⚠ {msg}</div>'

    # Overall metrics table
    overall_rows = "".join(
        f'<tr><td>{k}</td><td style="color:{_score_color(v)};font-weight:700">{_fmt(v)}</td></tr>'
        for k, v in overall.items()
    )

    # By-group table
    group_headers = set()
    for g_data in by_group.values():
        group_headers.update(g_data.keys())
    group_headers = sorted(group_headers)

    group_header_html = "".join(f"<th>{h}</th>" for h in group_headers)
    group_rows_html = "".join(
        f'<tr><td><strong>{grp}</strong></td>'
        + "".join(f'<td>{_fmt(g_data.get(h))}</td>' for h in group_headers)
        + "</tr>"
        for grp, g_data in by_group.items()
    )

    # Performance
    perf_rows = "".join(
        f'<tr><td>{k}</td><td style="color:#38bdf8;font-weight:700">{_fmt(v)}</td></tr>'
        for k, v in (perf or {}).items() if not isinstance(v, dict)
    )

    # Data quality
    dq_html = ""
    if dq:
        dq_html = f"""
        <div class="subsection">
            <h4>Data Quality</h4>
            <div class="kv-grid">
                <div class="kv"><span>Rows</span><strong>{dq.get('num_rows','N/A')}</strong></div>
                <div class="kv"><span>Columns</span><strong>{dq.get('num_columns','N/A')}</strong></div>
                <div class="kv"><span>Duplicate rows</span><strong>{dq.get('duplicate_rows','N/A')}</strong></div>
                <div class="kv"><span>Missing columns</span><strong>{len(dq.get('missing_columns',{}))}</strong></div>
            </div>
        </div>"""

    # Suggestions
    sugg_html = ""
    if suggestions:
        items = "".join(f"<li>{s}</li>" for s in suggestions)
        sugg_html = f'<div class="subsection"><h4>Suggestions</h4><ul class="sugg-list">{items}</ul></div>'

    return f"""
    <div class="subsection">
        <h4>Overall Fairness Metrics</h4>
        <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>{overall_rows}</tbody></table>
    </div>
    <div class="subsection">
        <h4>By Group</h4>
        <div style="overflow-x:auto">
        <table><thead><tr><th>Group</th>{group_header_html}</tr></thead><tbody>{group_rows_html}</tbody></table>
        </div>
    </div>
    <div class="subsection">
        <h4>Model Performance</h4>
        <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>{perf_rows}</tbody></table>
    </div>
    {dq_html}
    {sugg_html}
    """


def _render_explainability(data: dict) -> str:
    if data.get("status") == "placeholder":
        pd_ = data.get("placeholder_data", {})
        return f"""
        <div class="placeholder-banner">
            🔧 {data.get('message','Placeholder')}
        </div>
        <div class="kv-grid">
            <div class="kv"><span>Rows analysed</span><strong>{pd_.get('num_rows','—')}</strong></div>
            <div class="kv"><span>Features</span><strong>{pd_.get('num_features','—')}</strong></div>
        </div>"""
    if "error" in data:
        return f'<div class="module-error">⚠ {data["error"]}</div>'

    # Real implementation output — render whatever keys your team returns
    return f'<pre style="font-size:12px;overflow-x:auto">{json.dumps(data, indent=2, default=str)}</pre>'


def _render_compliance(data: dict) -> str:
    if data.get("status") == "placeholder":
        pd_ = data.get("placeholder_data", {})
        cols = ", ".join(pd_.get("text_columns", [])) or "none detected"
        return f"""
        <div class="placeholder-banner">
            🔧 {data.get('message','Placeholder')}
        </div>
        <div class="kv-grid">
            <div class="kv"><span>Rows scanned</span><strong>{pd_.get('num_rows','—')}</strong></div>
            <div class="kv"><span>Text columns</span><strong>{cols}</strong></div>
        </div>"""
    if "error" in data:
        return f'<div class="module-error">⚠ {data["error"]}</div>'

    return f'<pre style="font-size:12px;overflow-x:auto">{json.dumps(data, indent=2, default=str)}</pre>'


def _render_energy(data: dict) -> str:
    if data.get("status") == "placeholder":
        return f"""
        <div class="placeholder-banner">
            🔧 {data.get('message','Placeholder')}
        </div>"""
    if "error" in data:
        return f'<div class="module-error">⚠ {data["error"]}</div>'

    pd_ = data.get("placeholder_data", data)
    return f"""
    <div class="kv-grid">
        <div class="kv"><span>Emissions (kg CO₂eq)</span><strong>{_fmt(pd_.get('emissions_kg'))}</strong></div>
        <div class="kv"><span>Energy (kWh)</span><strong>{_fmt(pd_.get('energy_kwh'))}</strong></div>
        <div class="kv"><span>Duration (s)</span><strong>{_fmt(pd_.get('duration_s'))}</strong></div>
    </div>"""


MODULE_RENDERERS = {
    "fairness":       ("⚖ Fairness",        "#f59e0b", _render_fairness),
    "explainability": ("🔍 Explainability",  "#a78bfa", _render_explainability),
    "compliance":     ("🛡 Compliance",       "#22c55e", _render_compliance),
    "energy":         ("⚡ Energy Efficiency","#38bdf8", _render_energy),
}

MODULE_DESCRIPTIONS = {
    "fairness":       "Fairlearn-based analysis of demographic parity, equalized odds, and group-level fairness metrics.",
    "explainability": "SHAP and LIME explanations showing which features drive model predictions.",
    "compliance":     "Microsoft Presidio scan for personally identifiable information (PII) in the dataset.",
    "energy":         "CodeCarbon tracking of CO₂ emissions and energy consumption during model execution.",
}


def generate_unified_report(job_id: str, module_results: dict, modules: list) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build module sections
    sections_html = ""
    for module_name in modules:
        data = module_results.get(module_name, {"error": "No result returned"})
        label, accent, renderer = MODULE_RENDERERS.get(
            module_name,
            (module_name.title(), "#6b7280", lambda d: str(d))
        )
        desc = MODULE_DESCRIPTIONS.get(module_name, "")
        body = renderer(data)
        status = data.get("status", "done")
        status_badge = (
            '<span class="badge-ok">✓ Complete</span>' if status == "ok" else
            '<span class="badge-warn">⚠ Placeholder</span>' if status == "placeholder" else
            '<span class="badge-err">✗ Error</span>'
        )
        sections_html += f"""
        <section class="module-card" style="border-top: 3px solid {accent}">
            <div class="module-header">
                <div>
                    <h3>{label}</h3>
                    <p class="module-desc">{desc}</p>
                </div>
                {status_badge}
            </div>
            <div class="module-body">{body}</div>
        </section>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Audit Report — {job_id[:8]}</title>
<style>
  :root {{
    --bg: #0c0e12; --surface: #141821; --surface2: #1c2030;
    --border: #2a2f3d; --text: #c8cdd8; --dim: #6b7280;
    --amber: #f59e0b; --green: #22c55e; --red: #ef4444;
    --sky: #38bdf8; --violet: #a78bfa;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.6; }}
  .header {{ background: var(--surface); border-bottom: 1px solid var(--border); padding: 24px 40px; }}
  .header h1 {{ font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.02em; }}
  .header h1 span {{ color: var(--amber); }}
  .meta {{ color: var(--dim); font-size: 12px; margin-top: 6px; }}
  .container {{ max-width: 960px; margin: 0 auto; padding: 32px 24px; }}
  .summary-bar {{ display: flex; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }}
  .summary-chip {{ background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; font-size: 12px; }}
  .summary-chip strong {{ display: block; font-size: 18px; font-weight: 800; color: #fff; }}
  .module-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 24px; overflow: hidden; }}
  .module-header {{ display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 22px 14px; border-bottom: 1px solid var(--border); }}
  .module-header h3 {{ font-size: 16px; font-weight: 700; color: #fff; }}
  .module-desc {{ color: var(--dim); font-size: 12px; margin-top: 3px; max-width: 560px; }}
  .module-body {{ padding: 18px 22px; }}
  .subsection {{ margin-bottom: 20px; }}
  .subsection h4 {{ font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dim); margin-bottom: 10px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: left; }}
  th {{ color: var(--dim); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }}
  .kv-grid {{ display: flex; gap: 12px; flex-wrap: wrap; }}
  .kv {{ background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; min-width: 140px; }}
  .kv span {{ display: block; color: var(--dim); font-size: 11px; margin-bottom: 2px; }}
  .kv strong {{ font-size: 16px; color: #fff; }}
  .sugg-list {{ padding-left: 18px; color: var(--text); }}
  .sugg-list li {{ margin-bottom: 6px; font-size: 13px; }}
  .placeholder-banner {{ background: #1c1e10; border: 1px solid #3d3d10; color: #a3a320; border-radius: 6px; padding: 12px 16px; font-size: 13px; margin-bottom: 14px; }}
  .module-error {{ background: #1c1010; border: 1px solid #3d1010; color: var(--red); border-radius: 6px; padding: 12px 16px; font-size: 13px; }}
  .badge-ok {{ background: #22c55e22; color: var(--green); border: 1px solid #22c55e44; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }}
  .badge-warn {{ background: #f59e0b22; color: var(--amber); border: 1px solid #f59e0b44; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }}
  .badge-err {{ background: #ef444422; color: var(--red); border: 1px solid #ef444444; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }}
  .footer {{ text-align: center; color: var(--dim); font-size: 11px; padding: 32px 0 48px; border-top: 1px solid var(--border); margin-top: 8px; }}
</style>
</head>
<body>
<div class="header">
  <h1>FairCheck <span>AI</span> — Unified Audit Report</h1>
  <div class="meta">
    Job ID: {job_id} &nbsp;·&nbsp; Generated: {timestamp} &nbsp;·&nbsp;
    Modules: {', '.join(modules)}
  </div>
</div>

<div class="container">
  <div class="summary-bar">
    <div class="summary-chip"><span>Modules run</span><strong>{len(modules)}</strong></div>
    <div class="summary-chip"><span>Complete</span><strong style="color:var(--green)">{sum(1 for m in modules if module_results.get(m,{}).get('status') == 'ok')}</strong></div>
    <div class="summary-chip"><span>Placeholder</span><strong style="color:var(--amber)">{sum(1 for m in modules if module_results.get(m,{}).get('status') == 'placeholder')}</strong></div>
    <div class="summary-chip"><span>Errors</span><strong style="color:var(--red)">{sum(1 for m in modules if 'error' in module_results.get(m,{}))}</strong></div>
  </div>

  {sections_html}
</div>

<div class="footer">
  FairCheck AI Audit System &nbsp;·&nbsp; {timestamp}
</div>
</body>
</html>"""

    path = os.path.join(REPORT_DIR, f"report_{job_id}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path
