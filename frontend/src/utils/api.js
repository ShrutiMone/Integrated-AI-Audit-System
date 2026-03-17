// frontend/src/utils/api.js
const BASE = "http://127.0.0.1:5000";

// ── New orchestration API ─────────────────────────────────────────────────

/**
 * Start a multi-module audit job.
 * @param {File}     csvFile  - uploaded CSV
 * @param {string[]} modules  - e.g. ["fairness","explainability"]
 * @param {object}   params   - { target, sensitive, pred_col, train_baseline,
 *                               model_file, wrap_model, dp_threshold, ... }
 */
export const startAudit = async (csvFile, modules, params = {}) => {
  const fd = new FormData();
  fd.append("file", csvFile);
  fd.append("modules", modules.join(","));
  if (params.target)         fd.append("target",         params.target);
  if (params.sensitive)      fd.append("sensitive",      params.sensitive);
  if (params.pred_col)       fd.append("pred_col",       params.pred_col);
  if (params.model_file)     fd.append("user_model",     params.model_file);
  fd.append("train_baseline", params.train_baseline ? "1" : "0");
  fd.append("wrap_model",     params.wrap_model     ? "1" : "0");
  fd.append("dp_threshold",   params.dp_threshold  ?? 0.1);
  fd.append("eo_threshold",   params.eo_threshold  ?? 0.1);
  fd.append("fpr_threshold",  params.fpr_threshold ?? 0.1);
  fd.append("fnr_threshold",  params.fnr_threshold ?? 0.1);

  const res = await fetch(`${BASE}/audit/start`, { method: "POST", body: fd });
  return res.json();
};

/** Poll per-module status */
export const getAuditStatus = async (jobId) => {
  const res = await fetch(`${BASE}/audit/status/${jobId}`);
  return res.json();
};

/** Fetch full results after job is done */
export const getAuditResult = async (jobId) => {
  const res = await fetch(`${BASE}/audit/result/${jobId}`);
  return res.json();
};

/** Download unified HTML report */
export const getReportUrl = (jobId) => `${BASE}/audit/report/${jobId}`;


// ── Legacy fairness-only API (keep existing fairness flow working) ─────────

export const analyzeDataset = async (
  file, target, sensitive, pred_col = null,
  train_baseline = true, modelFile = null, wrapModel = false
) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("target", target);
  fd.append("sensitive", sensitive);
  fd.append("train_baseline", train_baseline ? "1" : "0");
  fd.append("wrap_model", wrapModel ? "1" : "0");
  if (pred_col)   fd.append("pred_col",   pred_col);
  if (modelFile)  fd.append("user_model", modelFile);
  const res = await fetch(`${BASE}/analyze`, { method: "POST", body: fd });
  return res.json();
};

export const mitigateDatasetAsync = async (file, target, sensitive, constraint = "demographic_parity") => {
  const fd = new FormData();
  fd.append("file", file); fd.append("target", target);
  fd.append("sensitive", sensitive); fd.append("constraint", constraint);
  const res = await fetch(`${BASE}/mitigate_async`, { method: "POST", body: fd });
  return res.json();
};

export const mitigateUserModelAsync = async (dataFile, modelFile, target, sensitive, constraint = "demographic_parity") => {
  const fd = new FormData();
  fd.append("file", dataFile); fd.append("user_model", modelFile);
  fd.append("target", target); fd.append("sensitive", sensitive);
  fd.append("constraint", constraint);
  const res = await fetch(`${BASE}/mitigate_user_model_async`, { method: "POST", body: fd });
  return res.json();
};

export const getProgress = async (jobId) => {
  const res = await fetch(`${BASE}/progress/${jobId}`);
  return res.json();
};

export const getResult = async (jobId) => {
  const res = await fetch(`${BASE}/result/${jobId}`);
  return res.json();
};
