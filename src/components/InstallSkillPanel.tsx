"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type InstallMode = "clawhub" | "raw" | "prompt";
const INSTALL_MODES: InstallMode[] = ["clawhub", "raw", "prompt"];

const SKILL_NAME = "clawdefi-agent";
const DEFAULT_SKILL_BASE = "https://www.clawdefi.ai/skills/clawdefi-agent";
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

  if (mode === "prompt") {
    return `Please fetch this first:
curl "https://www.clawdefi.ai/skill.md"

Then follow the installation steps in that file to install the skill.`;
  }

  return `SKILL_URL=${SKILL_BASE}/SKILL.md \\
MANIFEST_URL=${SKILL_BASE}/manifest.json \\
bash <(curl -fsSL ${SKILL_BASE}/scripts/install-raw.sh)`;
}

function buildFootnote(mode: InstallMode) {
  if (mode === "clawhub") {
    return "Best UX for most users. ClawHub handles package updates and versioning.";
  }
  if (mode === "prompt") {
    return "Your claw is smart and knows how to do it by itself.";
  }
  return "Raw mode is useful when ClawHub is unavailable. Uses your hosted SKILL.md + manifest.";
}

export default function InstallSkillPanel() {
  const [mode, setMode] = useState<InstallMode>("clawhub");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [bodyMinHeight, setBodyMinHeight] = useState(0);
  const [codeWrapMinHeight, setCodeWrapMinHeight] = useState(0);
  const panelBodyRef = useRef<HTMLDivElement | null>(null);
  const command = useMemo(() => buildCommand(mode), [mode]);
  const footnote = useMemo(() => buildFootnote(mode), [mode]);

  useEffect(() => {
    const node = panelBodyRef.current;
    if (!node) {
      return;
    }

    const measure = () => {
      const variants = node.querySelectorAll<HTMLElement>("[data-install-measure]");
      const codeVariants = node.querySelectorAll<HTMLElement>("[data-install-code-measure]");
      let maxHeight = 0;
      let maxCodeHeight = 0;
      variants.forEach((variant) => {
        maxHeight = Math.max(maxHeight, Math.ceil(variant.getBoundingClientRect().height));
      });
      codeVariants.forEach((variant) => {
        maxCodeHeight = Math.max(maxCodeHeight, Math.ceil(variant.getBoundingClientRect().height));
      });

      if (maxHeight > 0) {
        setBodyMinHeight((prev) => (prev === maxHeight ? prev : maxHeight));
      }
      if (maxCodeHeight > 0) {
        setCodeWrapMinHeight((prev) => (prev === maxCodeHeight ? prev : maxCodeHeight));
      }
    };

    const measureNextFrame = () => {
      requestAnimationFrame(measure);
    };

    measureNextFrame();

    const onResize = () => measureNextFrame();
    window.addEventListener("resize", onResize);

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measureNextFrame()) : null;
    observer?.observe(node);

    return () => {
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, []);

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
        {INSTALL_MODES.map((installMode) => (
          <button
            key={installMode}
            type="button"
            className={mode === installMode ? "install-tab is-active" : "install-tab"}
            onClick={() => setMode(installMode)}
            role="tab"
            aria-selected={mode === installMode}
          >
            {installMode === "clawhub" ? "ClawHub" : installMode === "raw" ? "Raw" : "Prompt"}
          </button>
        ))}
      </div>

      <div
        ref={panelBodyRef}
        className="install-body"
        style={bodyMinHeight > 0 ? { minHeight: `${bodyMinHeight}px` } : undefined}
      >
        <div className="install-measure-layer" aria-hidden>
          {INSTALL_MODES.map((installMode) => (
            <div key={`measure-${installMode}`} className="install-measure-item" data-install-measure>
              <div className="install-code-wrap" data-install-code-measure>
                <pre className="install-code">
                  <code>{buildCommand(installMode)}</code>
                </pre>
              </div>
              <p className="install-footnote">{buildFootnote(installMode)}</p>
              <p className="install-footnote subtle">Artifact base: {SKILL_BASE}</p>
            </div>
          ))}
        </div>

        <div
          className="install-code-wrap"
          style={codeWrapMinHeight > 0 ? { minHeight: `${codeWrapMinHeight}px` } : undefined}
        >
          <pre className="install-code">
            <code>{command}</code>
          </pre>
          <button type="button" className="copy-btn" onClick={onCopy}>
            {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
          </button>
        </div>

        <p className="install-footnote">{footnote}</p>
        <p className="install-footnote subtle">Artifact base: {SKILL_BASE}</p>
      </div>
    </section>
  );
}
