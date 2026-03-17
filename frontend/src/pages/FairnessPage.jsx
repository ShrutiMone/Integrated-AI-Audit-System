// frontend/src/pages/FairnessPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone deep-dive fairness page.
// Preserves the full original upload → report → mitigation flow.
// Can be reached directly from the Navbar or from the Audit results screen.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from "react";
import { T } from "../theme";
import {
  analyzeDataset,
  mitigateDatasetAsync, mitigateUserModelAsync,
  getProgress, getResult,
} from "../utils/api";

/* ── tiny shared primitives ─────────────────────────────────────────────── */

function Card({ children, accent, style = {} }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "20px",
      borderTop: accent ? `3px solid ${accent}` : undefined,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      color: "#fff", fontSize: 14, fontWeight: 700, marginBottom: 14,
      paddingBottom: 10, borderBottom: `1px solid ${T.border}`,
    }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      color: T.textDim, fontSize: 11, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        width: "100%", padding: "8px 10px",
        background: T.surfaceHi, border: `1px solid ${T.border}`,
        borderRadius: 6, color: value ? T.text : T.textDim,
        fontFamily: T.font, fontSize: 13, outline: "none",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 34, height: 18, borderRadius: 9, cursor: "pointer", flexShrink: 0, marginTop: 2,
          background: checked ? T.amber : T.border, position: "relative", transition: "background .2s",
        }}
      >
        <div style={{
          position: "absolute", top: 2, left: checked ? 16 : 2,
          width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .2s",
        }} />
      </div>
      <div>
        <div style={{ color: T.text, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function MetricRow({ label, value }) {
  const num = typeof value === "number" ? value : parseFloat(value);
  const color = isNaN(num) ? T.textDim : Math.abs(num) < 0.1 ? T.green : Math.abs(num) < 0.2 ? T.amber : T.red;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ color: T.text, fontSize: 13 }}>{label}</span>
      <span style={{
        fontFamily: "monospace", fontSize: 14, fontWeight: 700, color,
        background: color + "18", padding: "2px 10px", borderRadius: 5,
        border: `1px solid ${color}33`,
      }}>
        {typeof value === "number" ? value.toFixed(4) : String(value)}
      </span>
    </div>
  );
}

function PerfRow({ label, value }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "9px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ color: T.text, fontSize: 13 }}>{label}</span>
      <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: T.sky, background: T.skyDim, padding: "2px 10px", borderRadius: 5, border: `1px solid ${T.sky}33` }}>
        {typeof value === "number" ? value.toFixed(4) : String(value)}
      </span>
    </div>
  );
}

function FairnessScorecard({ overall }) {
  if (!overall) return null;
  const values = Object.values(overall).filter(v => typeof v === "number");
  if (!values.length) return null;
  const avgBias = values.reduce((s, v) => s + Math.abs(v), 0) / values.length;
  const score = Math.max(0, Math.round((1 - avgBias) * 100));
  const color = score >= 80 ? T.green : score >= 60 ? T.amber : T.red;
  const label = score >= 80 ? "FAIR" : score >= 60 ? "MODERATE BIAS" : "HIGH BIAS";

  return (
    <Card accent={color} style={{ textAlign: "center", padding: "24px 20px" }}>
      <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Overall Fairness Score
      </div>
      <div style={{ fontSize: 52, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-0.04em" }}>
        {score}
      </div>
      <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>/ 100</div>
      <div style={{
        display: "inline-block", marginTop: 10,
        fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 20,
        background: color + "22", color, border: `1px solid ${color}44`,
        letterSpacing: "0.06em",
      }}>
        {label}
      </div>
    </Card>
  );
}

function GroupCard({ group, metrics }) {
  return (
    <div style={{
      background: T.surfaceHi, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: "14px 16px",
    }}>
      <div style={{
        color: T.violet, fontSize: 12, fontWeight: 700,
        fontFamily: "monospace", marginBottom: 10,
        borderBottom: `1px solid ${T.border}`, paddingBottom: 8,
      }}>
        Group: {group}
      </div>
      {Object.entries(metrics).map(([name, val]) => (
        <div key={name} style={{
          display: "flex", justifyContent: "space-between",
          padding: "5px 0", borderBottom: `1px solid ${T.border}33`,
        }}>
          <span style={{ color: T.textDim, fontSize: 12 }}>{name}</span>
          <span style={{ color: T.text, fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
            {val === null || val === undefined ? "N/A" : typeof val === "number" ? val.toFixed(4) : String(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function readCSVHeaders(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const first = e.target.result.split(/\r?\n/)[0];
      resolve(first.split(",").map(h => h.trim().replace(/^["']|["']$/g, "")));
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/* ── UploadStep ─────────────────────────────────────────────────────────── */
function UploadStep({ onSubmit }) {
  const [file,       setFile]       = useState(null);
  const [headers,    setHeaders]    = useState([]);
  const [target,     setTarget]     = useState("");
  const [sensitive,  setSensitive]  = useState("");
  const [predCol,    setPredCol]    = useState("");
  const [trainBase,  setTrainBase]  = useState(true);
  const [modelFile,  setModelFile]  = useState(null);
  const [wrapModel,  setWrapModel]  = useState(false);
  const [dpThr,      setDpThr]      = useState(0.1);
  const [eoThr,      setEoThr]      = useState(0.1);
  const [fprThr,     setFprThr]     = useState(0.1);
  const [fnrThr,     setFnrThr]     = useState(0.1);
  const fileRef  = useRef();
  const modelRef = useRef();

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const hdrs = await readCSVHeaders(f);
    setHeaders(hdrs);
    setTarget(""); setSensitive(""); setPredCol("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file || !target || !sensitive) return;
    onSubmit(file, target, sensitive, predCol || null, trainBase, modelFile, wrapModel, dpThr, eoThr, fprThr, fnrThr);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 24 }}>
      <Card accent={T.amber}>
        <SectionTitle>Dataset</SectionTitle>
        {/* CSV upload */}
        <div style={{ marginBottom: 18 }}>
          <Label>CSV File *</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={() => fileRef.current.click()}
              style={{
                padding: "8px 16px", borderRadius: 6,
                border: `1px solid ${file ? T.green : T.border}`,
                background: file ? T.greenDim : T.surfaceHi,
                color: file ? T.green : T.text,
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
              }}>
              {file ? `✓ ${file.name}` : "Browse CSV…"}
            </button>
            {file && <button type="button" onClick={() => { setFile(null); setHeaders([]); }}
              style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18 }}>×</button>}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
          </div>
        </div>

        {headers.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div><Label>Target Column *</Label>
              <Select value={target} onChange={e => setTarget(e.target.value)} options={headers} placeholder="Select…" /></div>
            <div><Label>Sensitive Attribute *</Label>
              <Select value={sensitive} onChange={e => setSensitive(e.target.value)} options={headers} placeholder="Select…" /></div>
            <div><Label>Prediction Column</Label>
              <Select value={predCol} onChange={e => setPredCol(e.target.value)} options={headers} placeholder="None (train baseline)" /></div>
          </div>
        )}
      </Card>

      {headers.length > 0 && (
        <Card>
          <SectionTitle>Model (optional)</SectionTitle>
          <Toggle checked={trainBase} onChange={setTrainBase}
            label="Train internal baseline model"
            sub="Fit a logistic regression on your data for fairness analysis." />
          <div style={{ marginBottom: 12 }}>
            <Label>Upload your model (.joblib / .pkl / .onnx / .pt)</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={() => modelRef.current.click()}
                style={{
                  padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
                  border: `1px solid ${modelFile ? T.green : T.border}`,
                  background: modelFile ? T.greenDim : T.surfaceHi, color: modelFile ? T.green : T.text,
                }}>
                {modelFile ? `✓ ${modelFile.name}` : "Browse model…"}
              </button>
              {modelFile && <button type="button" onClick={() => setModelFile(null)}
                style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18 }}>×</button>}
              <input ref={modelRef} type="file" accept=".joblib,.pkl,.onnx,.keras,.h5,.pt,.pth"
                style={{ display: "none" }} onChange={e => setModelFile(e.target.files[0] || null)} />
            </div>
          </div>
          {modelFile && (
            <Toggle checked={wrapModel} onChange={setWrapModel}
              label="Apply standard preprocessing if prediction fails"
              sub="Fits a ColumnTransformer and retries inference." />
          )}
        </Card>
      )}

      {headers.length > 0 && (
        <Card>
          <SectionTitle>Fairness Thresholds</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {[
              { label: "Demographic Parity", val: dpThr, set: setDpThr },
              { label: "Equalized Odds",     val: eoThr, set: setEoThr },
              { label: "FPR Difference",     val: fprThr, set: setFprThr },
              { label: "FNR Difference",     val: fnrThr, set: setFnrThr },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <Label>{label}</Label>
                <input type="number" step="0.01" min="0" max="1" value={val}
                  onChange={e => set(parseFloat(e.target.value))}
                  style={{ width: "100%", padding: "7px 10px", background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontFamily: T.font, fontSize: 13 }} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {headers.length > 0 && (
        <button type="submit"
          style={{
            padding: "12px 28px", borderRadius: 8, alignSelf: "flex-start",
            background: `linear-gradient(135deg, ${T.amber}, #e07b00)`,
            border: "none", color: "#000", fontSize: 14, fontWeight: 800,
            cursor: "pointer", fontFamily: T.font,
          }}>
          Analyze Fairness →
        </button>
      )}
    </form>
  );
}

/* ── ReportStep ─────────────────────────────────────────────────────────── */
function ReportStep({ results, onReset }) {
  if (!results) return null;
  if (results.error) {
    return (
      <div style={{
        maxWidth: 1100, margin: "0 auto", padding: "24px 0",
        fontFamily: T.font,
      }}>
        <div style={{
          background: T.redDim, border: `1px solid ${T.red}44`,
          borderRadius: 10, padding: "16px 20px", color: T.red,
        }}>
          ⚠ {results.error}
        </div>
      </div>
    );
  }

  const {
    overall,
    by_group,
    suggestions,
    performance,
    data_quality,
    metrics_baseline_test,
    performance_baseline_test,
  } = results;

  const perfSource = performance || results.performance_baseline;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>Fairness Report</h3>
        <button onClick={onReset} style={{
          padding: "7px 14px", borderRadius: 6, background: T.surfaceHi,
          border: `1px solid ${T.border}`, color: T.textDim, cursor: "pointer", fontFamily: T.font, fontSize: 13,
        }}>← New Analysis</button>
      </div>

      <div style={{ color: T.textDim, fontSize: 13 }}>
        Showing bias metrics across sensitive groups.
        {results.strategy && <span> · Strategy: <code style={{ color: T.sky }}>{results.strategy}</code></span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 14 }}>
        <FairnessScorecard overall={overall} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {data_quality && (
            <>
              <Card accent={T.sky}>
                <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Dataset Size
                </div>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {data_quality.num_rows?.toLocaleString()}
                </div>
                <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>
                  rows · {data_quality.num_columns} columns
                </div>
              </Card>
              <Card accent={data_quality.duplicate_rows > 0 ? T.amber : T.green}>
                <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Duplicates
                </div>
                <div style={{
                  color: data_quality.duplicate_rows > 0 ? T.amber : T.green,
                  fontSize: 28, fontWeight: 800, marginTop: 6,
                }}>
                  {data_quality.duplicate_rows}
                </div>
                <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>
                  {Object.keys(data_quality.missing_columns || {}).length} cols with missing values
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {overall && (
          <Card accent={T.amber}>
            <SectionTitle>Fairness Metrics</SectionTitle>
            {Object.entries(overall).map(([k, v]) => (
              <MetricRow key={k} label={k} value={v} />
            ))}
          </Card>
        )}

        {perfSource && !perfSource.error && (
          <Card accent={T.sky}>
            <SectionTitle>Performance Metrics</SectionTitle>
            {Object.entries(perfSource).map(([k, v]) => (
              <PerfRow key={k} label={k} value={v} />
            ))}
          </Card>
        )}
      </div>

      {(metrics_baseline_test || performance_baseline_test) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {metrics_baseline_test?.overall && (
            <Card>
              <SectionTitle>Holdout Fairness Metrics</SectionTitle>
              {Object.entries(metrics_baseline_test.overall).map(([k, v]) => (
                <MetricRow key={k} label={k} value={v} />
              ))}
            </Card>
          )}
          {performance_baseline_test && !performance_baseline_test.error && (
            <Card>
              <SectionTitle>Holdout Performance Metrics</SectionTitle>
              {Object.entries(performance_baseline_test).map(([k, v]) => (
                <PerfRow key={k} label={k} value={v} />
              ))}
            </Card>
          )}
        </div>
      )}

      {suggestions?.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${T.amber}`, borderRadius: "0 10px 10px 0" }}>
          <SectionTitle>⚡ Suggested Improvements</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "8px 12px", borderRadius: 6,
                background: T.surfaceHi, border: `1px solid ${T.border}`,
              }}>
                <span style={{ color: T.amber, fontSize: 14, flexShrink: 0, marginTop: 1 }}>›</span>
                <span style={{ color: T.text, fontSize: 13, lineHeight: 1.5 }}>{s}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data_quality && (
        <Card>
          <SectionTitle>Data Quality</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {data_quality.target_distribution && (
              <div>
                <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Target Distribution
                </div>
                {Object.entries(data_quality.target_distribution).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${T.border}33` }}>
                    <span style={{ color: T.text, fontSize: 12 }}>{k}</span>
                    <span style={{ color: T.sky, fontSize: 12, fontWeight: 600 }}>{v.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {data_quality.sensitive_distribution && (
              <div>
                <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Sensitive Group Distribution
                </div>
                {Object.entries(data_quality.sensitive_distribution).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${T.border}33` }}>
                    <span style={{ color: T.text, fontSize: 12 }}>{k}</span>
                    <span style={{ color: T.violet, fontSize: 12, fontWeight: 600 }}>{v.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {by_group && Object.keys(by_group).length > 0 && (
        <Card>
          <SectionTitle>Group-wise Metrics</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {Object.entries(by_group).map(([group, metrics]) => (
              <GroupCard key={group} group={group} metrics={metrics} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}


/* ── MitigationStep ─────────────────────────────────────────────────────── */
function MitigationStep({ uploadedFile, selectedTarget, selectedSensitive, uploadedModel }) {
  const [file,       setFile]       = useState(uploadedFile  || null);
  const [target,     setTarget]     = useState(selectedTarget || "");
  const [sensitive,  setSensitive]  = useState(selectedSensitive || "");
  const [userModel,  setUserModel]  = useState(uploadedModel || null);
  const [mode,       setMode]       = useState(uploadedModel ? "user_model" : "builtin");
  const [constraint, setConstraint] = useState("demographic_parity");
  const [result,     setResult]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [pct,        setPct]        = useState(0);
  const [msg,        setMsg]        = useState("");
  const pollRef = useRef(null);

  const run = async () => {
    if (!file || !target || !sensitive) { alert("File, target and sensitive are required."); return; }
    setLoading(true); setResult(null); setPct(0); setMsg("queued");
    try {
      const startRes = mode === "builtin"
        ? await mitigateDatasetAsync(file, target, sensitive, constraint)
        : await mitigateUserModelAsync(file, userModel, target, sensitive, constraint);
      const jobId = startRes.job_id;
      if (!jobId) { setResult(startRes); setLoading(false); return; }
      pollRef.current = setInterval(async () => {
        try {
          const p = await getProgress(jobId);
          setPct(p.percent || 0); setMsg(p.message || "running");
          if (p.status === "done" || p.status === "failed") {
            clearInterval(pollRef.current);
            const final = await getResult(jobId);
            setResult(final); setLoading(false);
          }
        } catch { clearInterval(pollRef.current); setLoading(false); }
      }, 1000);
    } catch (err) {
      setResult({ error: String(err) }); setLoading(false);
    }
  };

  const overallBefore = result?.metrics_baseline?.overall || {};
  const overallAfter  = result?.metrics_after_mitigation?.overall || {};
  const perfBefore    = result?.performance_baseline || {};
  const perfAfter     = result?.performance_after_mitigation || {};

  const MetricCompare = ({ label, before, after }) => {
    const delta = (typeof before === "number" && typeof after === "number") ? before - after : null;
    const improved = delta !== null && delta > 0;
    const worsened = delta !== null && delta < 0;
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}`, gap: 8 }}>
        <span style={{ color: T.text, fontSize: 12, flex: 1 }}>{label}</span>
        <span style={{ color: T.textDim, fontFamily: "monospace", fontSize: 12, minWidth: 60, textAlign: "right" }}>{typeof before === "number" ? before.toFixed(4) : "—"}</span>
        <span style={{ color: T.textDim, fontSize: 12 }}>→</span>
        <span style={{ fontFamily: "monospace", fontSize: 12, minWidth: 60, textAlign: "right", color: T.text }}>{typeof after === "number" ? after.toFixed(4) : "—"}</span>
        {delta !== null && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 10, minWidth: 60, textAlign: "center",
            background: improved ? T.greenDim : worsened ? T.redDim : T.surfaceHi,
            color:      improved ? T.green    : worsened ? T.red    : T.textDim,
            border:    `1px solid ${improved ? T.green : worsened ? T.red : T.border}44`,
          }}>
            {improved ? "↓ " : worsened ? "↑ " : "→ "}{Math.abs(delta).toFixed(4)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <Card accent={T.violet}>
        <SectionTitle>Fairness Mitigation</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <Label>Constraint</Label>
            <select value={constraint} onChange={e => setConstraint(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontFamily: T.font, fontSize: 13 }}>
              <option value="demographic_parity">Demographic Parity</option>
              <option value="equalized_odds">Equalized Odds</option>
              <option value="false_positive_rate_parity">FPR Parity</option>
              <option value="false_negative_rate_parity">FNR Parity</option>
              <option value="true_positive_rate_parity">TPR Parity</option>
            </select>
          </div>
          <div>
            <Label>Mode</Label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontFamily: T.font, fontSize: 13 }}>
              <option value="builtin">Train baseline + mitigate</option>
              <option value="user_model">Mitigate uploaded model</option>
            </select>
          </div>
        </div>
        <button onClick={run} disabled={loading}
          style={{
            padding: "10px 24px", borderRadius: 7, fontFamily: T.font, fontWeight: 800, fontSize: 14,
            background: loading ? T.surfaceHi : `linear-gradient(135deg, ${T.violet}, #7c3aed)`,
            border: "none", color: loading ? T.textDim : "#fff", cursor: loading ? "not-allowed" : "pointer",
          }}>
          {loading ? `${msg} (${pct}%)` : "Run Mitigation →"}
        </button>
      </Card>

      {result?.error && (
        <div style={{ background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8, padding: 16, color: T.red }}>
          Error: {result.error}
        </div>
      )}

      {result && !result.error && (
        <>
          <Card accent={T.green}>
            <SectionTitle>Fairness Metrics: Before → After</SectionTitle>
            {Object.keys(overallBefore).map(k => (
              <MetricCompare key={k} label={k} before={overallBefore[k]} after={overallAfter[k]} />
            ))}
          </Card>
          <Card>
            <SectionTitle>Performance: Before → After</SectionTitle>
            {Object.keys(perfBefore).filter(k => typeof perfBefore[k] === "number").map(k => (
              <MetricCompare key={k} label={k} before={perfBefore[k]} after={perfAfter[k]} />
            ))}
          </Card>
          {result.model_download_url && (
            <div style={{ background: T.greenDim, border: `1px solid ${T.green}44`, borderRadius: 8, padding: 16 }}>
              <div style={{ color: T.green, fontWeight: 700, marginBottom: 6 }}>✓ Mitigated model ready</div>
              <a href={result.model_download_url} target="_blank" rel="noreferrer"
                style={{
                  display: "inline-block", padding: "8px 18px", borderRadius: 6,
                  background: T.green, color: "#000", fontWeight: 700, fontSize: 13, textDecoration: "none",
                }}>
                Download Model ↓
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── FairnessPage root ───────────────────────────────────────────────────── */
const TABS = ["Upload & Analyze", "Report", "Mitigation"];

const FairnessPage = ({ prefillFile, prefillTarget, prefillSensitive, prefillModel }) => {
  const [tab,       setTab]       = useState(0);
  const [results,   setResults]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile,    setUploadedFile]    = useState(prefillFile    || null);
  const [selectedTarget,  setSelectedTarget]  = useState(prefillTarget  || "");
  const [selectedSensitive, setSelectedSensitive] = useState(prefillSensitive || "");
  const [uploadedModel,   setUploadedModel]   = useState(prefillModel   || null);

  const handleSubmit = async (file, target, sensitive, predCol, trainBaseline, modelFile, wrapModel, dpThr, eoThr, fprThr, fnrThr) => {
    setUploadedFile(file); setSelectedTarget(target); setSelectedSensitive(sensitive); setUploadedModel(modelFile);
    setUploading(true); setTab(1);
    const res = await analyzeDataset(
      file,
      target,
      sensitive,
      predCol,
      trainBaseline,
      modelFile,
      wrapModel,
      dpThr,
      eoThr,
      fprThr,
      fnrThr,
    );
    setResults(res); setUploading(false);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 48px", fontFamily: T.font }}>
      {/* Page title */}
      <div style={{ paddingTop: 28, marginBottom: 8 }}>
        <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
          Fairness Deep Dive
        </h2>
        <p style={{ color: T.textDim, fontSize: 13, marginTop: 4 }}>
          Powered by Fairlearn — full analysis, group breakdown, and mitigation.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 0 }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => { if (i === 1 && !results && !uploading) return; setTab(i); }}
            style={{
              padding: "10px 20px", background: "none", border: "none",
              borderBottom: tab === i ? `2px solid ${T.amber}` : "2px solid transparent",
              color: tab === i ? "#fff" : T.textDim,
              fontWeight: tab === i ? 700 : 500, fontSize: 13,
              cursor: (i === 1 && !results && !uploading) ? "not-allowed" : "pointer",
              fontFamily: T.font, opacity: (i === 1 && !results && !uploading) ? 0.4 : 1,
            }}
          >{t}</button>
        ))}
      </div>

      {tab === 0 && <UploadStep onSubmit={handleSubmit} />}

      {tab === 1 && uploading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh", gap: 14, flexDirection: "column" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: `3px solid ${T.border}`, borderTop: `3px solid ${T.amber}`,
            animation: "spin .8s linear infinite",
          }} />
          <div style={{ color: T.textDim, fontSize: 14 }}>Analysing dataset…</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {tab === 1 && !uploading && (
        <ReportStep results={results} onReset={() => { setTab(0); setResults(null); }} />
      )}

      {tab === 2 && (
        <MitigationStep
          uploadedFile={uploadedFile}
          selectedTarget={selectedTarget}
          selectedSensitive={selectedSensitive}
          uploadedModel={uploadedModel}
        />
      )}
    </div>
  );
};

export default FairnessPage;
