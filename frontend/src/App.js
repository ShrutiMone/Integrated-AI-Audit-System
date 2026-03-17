// frontend/src/App.js
import React, { useState } from "react";
import Navbar      from "./components/Navbar";
import HomePage    from "./pages/HomePage";
import AuditPage   from "./pages/AuditPage";
import FairnessPage from "./pages/FairnessPage";
import GlossaryPage from "./pages/GlossaryPage";
import { T } from "./theme";

function App() {
  // currentPage: "home" | "audit" | "fairness" | "glossary"
  const [currentPage,  setCurrentPage]  = useState("home");
  const [auditParams,  setAuditParams]  = useState(null);
  // passed to FairnessPage when navigating from audit results
  const [fairnessPrefill, setFairnessPrefill] = useState({});

  const navigate = (page) => setCurrentPage(page);

  const handleStartAudit = (params) => {
    setAuditParams(params);
    setCurrentPage("audit");
  };

  const handleGoFairness = (prefill = {}) => {
    setFairnessPrefill(prefill);
    setCurrentPage("fairness");
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font }}>
      <Navbar currentPage={currentPage} onNavigate={navigate} />

      {currentPage === "home" && (
        <HomePage onStartAudit={handleStartAudit} />
      )}

      {currentPage === "audit" && (
        <AuditPage
          auditParams={auditParams}
          onBack={() => setCurrentPage("home")}
          onGoFairness={() => handleGoFairness({
            prefillFile:      auditParams?.csvFile,
            prefillTarget:    auditParams?.target,
            prefillSensitive: auditParams?.sensitive,
            prefillModel:     auditParams?.model_file,
          })}
        />
      )}

      {currentPage === "fairness" && (
        <FairnessPage
          prefillFile={fairnessPrefill.prefillFile}
          prefillTarget={fairnessPrefill.prefillTarget}
          prefillSensitive={fairnessPrefill.prefillSensitive}
          prefillModel={fairnessPrefill.prefillModel}
        />
      )}

      {currentPage === "glossary" && (
        <GlossaryPage />
      )}
    </div>
  );
}

export default App;
