// frontend/src/pages/HomePage.jsx
/* eslint-disable no-undef */
import React, { useState, useRef } from "react";
import { useTheme } from "../theme";

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

const HomePage = ({ onStartAudit }) => {
  const { T } = useTheme();

  const MODULES = [
    {
      id:    "fairness",
      label: "Fairness",
      icon:  "⚖",
      color: T.amber,
      dim:   T.amberDim,
      desc:  "Audit demographic parity, equalized odds, and group-level fairness metrics using Fairlearn.",
      tags:  ["Fairlearn", "Demographic Parity", "Equalized Odds"],
      requires: ["CSV dataset", "Target column", "Sensitive attribute"],
      live:  true,
    },
    {
      id:    "explainability",
      label: "Explainability",
      icon:  "🔍",
      color: T.violet,
      dim:   T.violetDim,
      desc:  "Generate SHAP values and LIME explanations to understand which features drive model predictions.",
      tags:  ["SHAP", "LIME", "Feature Importance"],
      requires: ["CSV dataset", "Target column", "Model file (optional)"],
      live:  false,
    },
    {
      id:    "compliance",
      label: "Compliance",
      icon:  "🛡",
      color: T.green,
      dim:   T.greenDim,
      desc:  "Scan your dataset for personally identifiable information (PII) using Microsoft Presidio.",
      tags:  ["Presidio", "PII Detection", "GDPR"],
      requires: ["CSV dataset"],
      live:  false,
    },
    {
      id:    "energy",
      label: "Energy Efficiency",
      icon:  "⚡",
      color: T.sky,
      dim:   T.skyDim,
      desc:  "Measure CO₂ emissions and energy consumption during model training and inference using CodeCarbon.",
      tags:  ["CodeCarbon", "CO₂", "Sustainability"],
      requires: ["CSV dataset", "Model file (optional)"],
      live:  false,
    },
  ];

  function ModuleCard({ module, selected, onToggle }) {
    return (
      <div
        onClick={() => onToggle(module.id)}
        style={{
          background:   selected ? module.dim : T.surface,
          border:       `1.5px solid ${selected ? module.color : T.border}`,
          borderRadius: 12,
          padding:      "18px 20px",
          cursor:       "pointer",
          transition:   "all .18s",
          position:     "relative",
          userSelect:   "none",
        }}
        onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = module.color + "88"; }}
        onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = T.border; }}
      >
        {/* Live / placeholder badge */}
        <div style={{
          position: "absolute", top: 14, right: 14,
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
          background: module.live ? T.greenDim : T.surfaceHi,
          color:      module.live ? T.green    : T.textDim,
          border:     `1px solid ${module.live ? T.green + "44" : T.border}`,
          letterSpacing: "0.04em",
        }}>
          {module.live ? "LIVE" : "SOON"}
        </div>

        {/* Checkbox */}
        <div style={{
          position: "absolute", top: 14, left: 14,
          width: 18, height: 18, borderRadius: 5,
          border: `2px solid ${selected ? module.color : T.border}`,
          background: selected ? module.color : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "#000", fontWeight: 900,
          transition: "all .15s",
        }}>
          {selected && "✓"}
        </div>

        {/* Icon + title */}
        <div style={{ marginTop: 8, marginLeft: 28, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{module.icon}</span>
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>{module.label}</span>
        </div>

        <p style={{ color: T.text, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{module.desc}</p>

        {/* Tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {module.tags.map(t => (
            <span key={t} style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 10,
              background: module.dim, color: module.color,
              border: `1px solid ${module.color}44`,
            }}>{t}</span>
          ))}
        </div>

        {/* Requires */}
        <div style={{ color: T.textDim, fontSize: 11 }}>
          Requires: {module.requires.join(", ")}
        </div>
      </div>
    );
  }

  const [selected, setSelected]   = useState(new Set(["fairness"]));
  const [csvFile,  setCsvFile]    = useState(null);
  const [headers,  setHeaders]    = useState([]);
  const [target,   setTarget]     = useState("");
  const [sensitive,setSensitive]  = useState("");
  const [predCol,  setPredCol]    = useState("");
  const [trainBaseline, setTrain] = useState(true);
  const [modelFile, setModelFile] = useState(null);
  const csvRef   = useRef();
  const modelRef = useRef();

  const toggleModule = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCsvChange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setCsvFile(f);
    const hdrs = await readCSVHeaders(f);
    setHeaders(hdrs);
    setTarget(""); setSensitive(""); setPredCol("");
  };

  const needsFairnessFields = selected.has("fairness");
  const canSubmit = csvFile && selected.size > 0 && (!needsFairnessFields || (target && sensitive));

  const handleSubmit = () => {
    if (!canSubmit) return;
    onStartAudit({
      csvFile,
      modules:       [...selected],
      target,
      sensitive,
      pred_col:      predCol || null,
      train_baseline: trainBaseline,
      model_file:    modelFile,
    });
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px", fontFamily: T.font }}>

      {/* Hero */}
      <div style={{ marginBottom: 40, maxWidth: 620 }}>
        <h1 style={{ color: "#fff", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
          AI Model Audit Suite
        </h1>
        <p style={{ color: T.textDim, fontSize: 15, lineHeight: 1.7 }}>
          Select the modules you want to run, upload your dataset and optionally a model,
          then let the audit run in parallel. A unified report is generated at the end.
        </p>
      </div>

      {/* Module selector */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
          1 — Select Modules
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {MODULES.map(m => (
            <ModuleCard key={m.id} module={m} selected={selected.has(m.id)} onToggle={toggleModule} />
          ))}
        </div>
      </div>

      {/* Upload section */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "24px 26px", marginBottom: 24 }}>
        <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 18 }}>
          2 — Upload Dataset
        </div>

        {/* CSV upload */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            CSV Dataset *
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => csvRef.current.click()}
              style={{
                padding: "8px 16px", borderRadius: 6, border: `1px solid ${csvFile ? T.green : T.border}`,
                background: csvFile ? T.greenDim : T.surfaceHi, color: csvFile ? T.green : T.text,
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
              }}
            >
              {csvFile ? `✓ ${csvFile.name}` : "Choose CSV file…"}
            </button>
            {csvFile && (
              <button onClick={() => { setCsvFile(null); setHeaders([]); }}
                style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18 }}>×</button>
            )}
            <input ref={csvRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsvChange} />
          </div>
        </div>

        {/* Column selectors — shown once CSV loaded */}
        {headers.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 16, marginBottom: 20 }}>
            {/* Target */}
            <div>
              <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Target Column {needsFairnessFields && "*"}
              </div>
              <select value={target} onChange={e => setTarget(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 6, color: target ? T.text : T.textDim, fontFamily: T.font, fontSize: 13 }}>
                <option value="">Select…</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            {/* Sensitive */}
            <div>
              <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Sensitive Attribute {needsFairnessFields && "*"}
              </div>
              <select value={sensitive} onChange={e => setSensitive(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 6, color: sensitive ? T.text : T.textDim, fontFamily: T.font, fontSize: 13 }}>
                <option value="">Select…</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            {/* Prediction col */}
            <div>
              <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Prediction Column (optional)
              </div>
              <select value={predCol} onChange={e => setPredCol(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 6, color: predCol ? T.text : T.textDim, fontFamily: T.font, fontSize: 13 }}>
                <option value="">None (train baseline)</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Train baseline toggle */}
        {headers.length > 0 && !predCol && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div
              onClick={() => setTrain(v => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                background: trainBaseline ? T.amber : T.border, position: "relative", transition: "background .2s",
              }}
            >
              <div style={{
                position: "absolute", top: 2,
                left: trainBaseline ? 18 : 2,
                width: 16, height: 16, borderRadius: "50%",
                background: "#fff", transition: "left .2s",
              }} />
            </div>
            <span style={{ color: T.text, fontSize: 13 }}>Train internal baseline model</span>
          </div>
        )}

        {/* Model upload */}
        <div>
          <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Model File (optional — .joblib / .pkl / .onnx / .pt)
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => modelRef.current.click()}
              style={{
                padding: "8px 16px", borderRadius: 6, border: `1px solid ${modelFile ? T.green : T.border}`,
                background: modelFile ? T.greenDim : T.surfaceHi, color: modelFile ? T.green : T.text,
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.font,
              }}
            >
              {modelFile ? `✓ ${modelFile.name}` : "Choose model file…"}
            </button>
            {modelFile && (
              <button onClick={() => setModelFile(null)}
                style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18 }}>×</button>
            )}
            <input ref={modelRef} type="file" accept=".joblib,.pkl,.onnx,.keras,.h5,.pt,.pth"
              style={{ display: "none" }} onChange={e => setModelFile(e.target.files[0] || null)} />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: "13px 32px", borderRadius: 8,
            background: canSubmit ? `linear-gradient(135deg, ${T.amber}, #e07b00)` : T.surfaceHi,
            border: "none", color: canSubmit ? "#000" : T.textDim,
            fontSize: 15, fontWeight: 800, cursor: canSubmit ? "pointer" : "not-allowed",
            fontFamily: T.font, letterSpacing: "0.01em", transition: "opacity .15s",
          }}
          onMouseEnter={e => { if (canSubmit) e.target.style.opacity = "0.85"; }}
          onMouseLeave={e => { e.target.style.opacity = "1"; }}
        >
          Run Audit → {selected.size > 0 && `(${selected.size} module${selected.size > 1 ? "s" : ""})`}
        </button>
        {!canSubmit && (
          <span style={{ color: T.textDim, fontSize: 13 }}>
            {!csvFile ? "Upload a CSV to continue" : !target ? "Select a target column" : "Select a sensitive attribute"}
          </span>
        )}
      </div>
    </div>
  );
};

export default HomePage;
