"use client";

import { useMemo, useState } from "react";

type InstallMode = "clawhub" | "raw";

const SKILL_NAME = "clawdefi-agent";
const DEFAULT_SKILL_BASE = "https://skills.clawdefi.ai/clawdefi-agent";
const SKILL_BASE = (process.env.NEXT_PUBLIC_SKILL_BASE_URL || DEFAULT_SKILL_BASE).replace(
  /\/+$/,
  ""
);

function buildCommand(mode: InstallMode) {
  if (mode === "clawhub") {
    return `npm i -g clawhub
clawhub install ${SKILL_NAME}
clawhub update ${SKILL_NAME}`;
  }

  return `SKILL_URL=${SKILL_BASE}/SKILL.md \\
MANIFEST_URL=${SKILL_BASE}/manifest.json \\
bash <(curl -fsSL ${SKILL_BASE}/scripts/install-raw.sh)`;
}

function buildFootnote(mode: InstallMode) {
  if (mode === "clawhub") {
    return "Best UX for most users. ClawHub handles package updates and versioning.";
  }
  return "Raw mode is useful when ClawHub is unavailable. Uses your hosted SKILL.md + manifest.";
}

export default function InstallSkillPanel() {
  const [mode, setMode] = useState<InstallMode>("clawhub");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const command = useMemo(() => buildCommand(mode), [mode]);
  const footnote = useMemo(() => buildFootnote(mode), [mode]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1400);
    } catch (_) {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 1400);
    }
  };

  return (
    <section className="install-panel" aria-label="Install skill panel">
      <div className="install-tabs" role="tablist" aria-label="Install modes">
        <button
          type="button"
          className={mode === "clawhub" ? "install-tab is-active" : "install-tab"}
          onClick={() => setMode("clawhub")}
          role="tab"
          aria-selected={mode === "clawhub"}
        >
          ClawHub
        </button>
        <button
          type="button"
          className={mode === "raw" ? "install-tab is-active" : "install-tab"}
          onClick={() => setMode("raw")}
          role="tab"
          aria-selected={mode === "raw"}
        >
          Raw
        </button>
      </div>

      <div className="install-code-wrap">
        <pre className="install-code">
          <code>{command}</code>
        </pre>
        <button type="button" className="copy-btn" onClick={onCopy}>
          {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
        </button>
      </div>

      <p className="install-footnote">{footnote}</p>
      <p className="install-footnote subtle">Artifact base: {SKILL_BASE}</p>
    </section>
  );
}
