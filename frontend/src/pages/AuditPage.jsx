// frontend/src/pages/AuditPage.jsx
import React, { useEffect, useRef, useState } from "react";
import { T } from "../theme";
import { startAudit, getAuditStatus, getAuditResult, getReportUrl } from "../utils/api";

const MODULE_META = {
  fairness:       { label: "Fairness",        icon: "⚖", color: T.amber  },
  explainability: { label: "Explainability",   icon: "🔍", color: T.violet },
  compliance:     { label: "Compliance",       icon: "🛡", color: T.green  },
  energy:         { label: "Energy",           icon: "⚡", color: T.sky    },
};

const STATUS_LABEL = {
  queued:  { text: "Queued",   color: T.textDim },
  running: { text: "Running…", color: T.amber   },
  done:    { text: "Done",     color: T.green   },
  error:   { text: "Error",    color: T.red     },
};

function Spinner({ color }) {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: "50%",
      border: `2px solid ${color}44`, borderTop: `2px solid ${color}`,
      animation: "spin .7s linear infinite", flexShrink: 0,
    }} />
  );
}

function ModuleStatusCard({ moduleId, status, result }) {
  const meta = MODULE_META[moduleId] || { label: moduleId, icon: "●", color: T.textDim };
  const s    = STATUS_LABEL[status] || { text: status, color: T.textDim };
  const isPlaceholder = result?.status === "placeholder";
  const hasError      = status === "error" || result?.error;

  return (
    <div style={{
      background: T.surface, border: `1px solid ${status === "done" ? meta.color + "55" : T.border}`,
      borderRadius: 10, padding: "16px 18px",
      borderLeft: `3px solid ${meta.color}`,
      transition: "border-color .3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{meta.icon}</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{meta.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {status === "running" && <Spinner color={meta.color} />}
          <span style={{ color: s.color, fontSize: 12, fontWeight: 700 }}>{s.text}</span>
        </div>
      </div>

      {/* Progress indicator */}
      {status === "running" && (
        <div style={{ height: 3, background: T.border, borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 3, background: meta.color,
            animation: "indeterminate 1.5s ease-in-out infinite",
          }} />
        </div>
      )}

      {/* Result summary */}
      {status === "done" && result && (
        <div style={{ marginTop: 10 }}>
          {isPlaceholder && (
            <div style={{ color: T.amber, fontSize: 12, padding: "6px 10px", background: T.amberDim, borderRadius: 5, marginBottom: 6 }}>
              ⚠ Placeholder — module not yet implemented
            </div>
          )}
          {hasError && !isPlaceholder && (
            <div style={{ color: T.red, fontSize: 12, padding: "6px 10px", background: T.redDim, borderRadius: 5 }}>
              Error: {result.error}
            </div>
          )}
          {moduleId === "fairness" && result.overall && (
            <div style={{ fontSize: 12, color: T.textDim }}>
              {Object.entries(result.overall).slice(0, 3).map(([k, v]) => (
                <span key={k} style={{ marginRight: 14 }}>
                  {k.replace(" Difference", " Δ")}: <strong style={{ color: Math.abs(v) < 0.1 ? T.green : T.amber }}>{typeof v === "number" ? v.toFixed(4) : v}</strong>
                </span>
              ))}
            </div>
          )}
          {!hasError && !isPlaceholder && moduleId !== "fairness" && (
            <div style={{ color: T.green, fontSize: 12 }}>Results ready — see report below</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fairness detail inline ──────────────────────────────────────────────────
function FairnessDetail({ data }) {
  if (!data || data.error) return null;
  const overall  = data.overall || {};
  const perf     = data.performance || {};
  const suggs    = data.suggestions || [];

  const MetricRow = ({ label, value }) => {
    const color = Math.abs(value) < 0.1 ? T.green : Math.abs(value) < 0.2 ? T.amber : T.red;
    return (
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ color: T.text, fontSize: 13 }}>{label}</span>
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color, background: color+"18", padding: "2px 10px", borderRadius: 5, border: `1px solid ${color}33` }}>
          {typeof value === "number" ? value.toFixed(4) : String(value)}
        </span>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Fairness Metrics</div>
          {Object.entries(overall).map(([k,v]) => <MetricRow key={k} label={k} value={v} />)}
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Performance</div>
          {Object.entries(perf).filter(([,v])=>typeof v==="number").map(([k,v])=>(
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.text, fontSize: 13 }}>{k}</span>
              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: T.sky }}>{v.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
      {suggs.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, marginTop: 14 }}>
          <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Suggestions</div>
          {suggs.map((s,i) => (
            <div key={i} style={{ fontSize: 13, color: T.text, padding: "6px 0", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
              <span style={{ color: T.amber }}>›</span>{s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Main AuditPage ──────────────────────────────────────────────────────────
const AuditPage = ({ auditParams, onBack, onGoFairness }) => {
  const [jobId,        setJobId]        = useState(null);
  const [jobStatus,    setJobStatus]    = useState("starting");
  const [moduleStatus, setModuleStatus] = useState({});
  const [results,      setResults]      = useState(null);
  const [error,        setError]        = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!auditParams) return;
    (async () => {
      try {
        const res = await startAudit(auditParams.csvFile, auditParams.modules, auditParams);
        if (res.error) { setError(res.error); return; }
        setJobId(res.job_id);
        const initStatus = {};
        res.modules.forEach(m => { initStatus[m] = "queued"; });
        setModuleStatus(initStatus);
        setJobStatus("running");
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [auditParams]);

  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;
    pollRef.current = setInterval(async () => {
      try {
        const st = await getAuditStatus(jobId);
        setModuleStatus(st.module_status || {});
        if (st.status === "done") {
          clearInterval(pollRef.current);
          setJobStatus("done");
          const r = await getAuditResult(jobId);
          setResults(r.module_results || {});
        }
      } catch (e) {
        clearInterval(pollRef.current);
        setError(String(e));
      }
    }, 1200);
    return () => clearInterval(pollRef.current);
  }, [jobId, jobStatus]);

  const modules = auditParams?.modules || [];
  const allDone = jobStatus === "done";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", fontFamily: T.font }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes indeterminate {
          0%   { width: 0%;   margin-left: 0%; }
          50%  { width: 60%;  margin-left: 20%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={onBack} style={{
          background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 6,
          color: T.textDim, padding: "6px 12px", cursor: "pointer", fontFamily: T.font, fontSize: 13,
        }}>← Back</button>
        <div>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: 0 }}>Audit in Progress</h2>
          {jobId && <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>Job: {jobId}</div>}
        </div>
        {allDone && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <a
              href={getReportUrl(jobId)}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "8px 18px", borderRadius: 7,
                background: `linear-gradient(135deg, ${T.amber}, #e07b00)`,
                color: "#000", fontWeight: 800, fontSize: 13, textDecoration: "none",
                fontFamily: T.font,
              }}
            >
              Download Report ↓
            </a>
            {modules.includes("fairness") && results?.fairness && !results.fairness.error && (
              <button onClick={onGoFairness} style={{
                padding: "8px 18px", borderRadius: 7, background: T.surfaceHi,
                border: `1px solid ${T.border}`, color: T.text, fontSize: 13,
                cursor: "pointer", fontFamily: T.font, fontWeight: 600,
              }}>
                Deep Fairness Analysis →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: T.redDim, border: `1px solid ${T.red}44`, borderRadius: 8, padding: 16, color: T.red, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Overall status banner */}
      <div style={{
        background: allDone ? T.greenDim : T.amberDim,
        border: `1px solid ${allDone ? T.green : T.amber}44`,
        borderRadius: 8, padding: "12px 18px", marginBottom: 22,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        {!allDone && <Spinner color={T.amber} />}
        <span style={{ color: allDone ? T.green : T.amber, fontWeight: 700, fontSize: 14 }}>
          {allDone
            ? `✓ All ${modules.length} module${modules.length > 1 ? "s" : ""} complete`
            : `Running ${modules.length} module${modules.length > 1 ? "s" : ""} in parallel…`}
        </span>
        <span style={{ color: T.textDim, fontSize: 12, marginLeft: "auto" }}>
          {Object.values(moduleStatus).filter(s => s === "done" || s === "error").length} / {modules.length} done
        </span>
      </div>

      {/* Per-module cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {modules.map(m => (
          <ModuleStatusCard
            key={m}
            moduleId={m}
            status={moduleStatus[m] || "queued"}
            result={results?.[m]}
          />
        ))}
      </div>

      {/* Fairness inline detail */}
      {allDone && results?.fairness && (
        <div>
          <div style={{ color: T.textDim, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Fairness Results
          </div>
          <FairnessDetail data={results.fairness} />
        </div>
      )}
    </div>
  );
};

export default AuditPage;
