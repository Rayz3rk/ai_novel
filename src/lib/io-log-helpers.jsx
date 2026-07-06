import React from "react";
import { formatJsonBlock, formatTime } from "./format.js";

export function findLatestIoLog(project, { workflows = [], stages = [], chapterId = "" } = {}) {
  const workflowSet = new Set((workflows || []).filter(Boolean));
  const stageSet = new Set((stages || []).filter(Boolean));

  return [...(project?.ioLogs || [])]
    .filter((log) => (workflowSet.size ? workflowSet.has(log.workflow) : true))
    .filter((log) => (stageSet.size ? stageSet.has(log.stage) : true))
    .filter((log) => {
      if (!chapterId) return true;
      if (!log.chapterId) return true;
      return log.chapterId === chapterId;
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null;
}

function mapAgentRoleLabel(role = "") {
  if (role === "context_scout" || role === "setting_scout") return "Scout";
  if (role === "beat_architect") return "Beat Architect";
  if (role === "continuity_reviewer") return "Continuity Reviewer";
  if (role === "setting_classifier") return "Classifier";
  if (role === "setting_reviewer") return "Reviewer";
  if (role === "intent_guard") return "Intent Guard";
  if (role === "style_architect") return "Style Architect";
  return role || "Agent";
}

function buildAgentTraceEntries(log) {
  const payload = log?.outputPayload || {};

  if (Array.isArray(payload.trace) && payload.trace.length) {
    return payload.trace.map((item, index) => ({
      id: `${item.role || "agent"}-${index}`,
      title: mapAgentRoleLabel(item.role),
      summary: item.output?.summary || "",
      body: item.output || {}
    }));
  }

  return [
    payload.scout ? { id: "scout", title: "Scout", summary: payload.scout.summary || "", body: payload.scout } : null,
    payload.classifier
      ? { id: "classifier", title: "Classifier", summary: payload.classifier.summary || "", body: payload.classifier }
      : null,
    payload.reviewer
      ? { id: "reviewer", title: "Reviewer", summary: payload.reviewer.summary || "", body: payload.reviewer }
      : null,
    payload.intentGuard
      ? { id: "intent-guard", title: "Intent Guard", summary: payload.intentGuard.summary || "", body: payload.intentGuard }
      : null,
    payload.styleArchitect
      ? {
          id: "style-architect",
          title: "Style Architect",
          summary: payload.styleArchitect.summary || "",
          body: payload.styleArchitect
        }
      : null,
    payload.continuityReviewer
      ? {
          id: "continuity-reviewer",
          title: "Continuity Reviewer",
          summary: payload.continuityReviewer.summary || "",
          body: payload.continuityReviewer
        }
      : null
  ].filter(Boolean);
}

export function AgentTracePanel({ title, log = null, emptyText, describeTrace }) {
  if (!log) {
    return (
      <article className="panel">
        <div className="panel-title compact">
          <div>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="workflow-empty">{emptyText}</p>
      </article>
    );
  }

  const entries = buildAgentTraceEntries(log);

  return (
    <article className="panel">
      <div className="panel-title compact">
        <div>
          <h2>{title}</h2>
          <span>{formatTime(log.createdAt)}</span>
        </div>
      </div>
      <p className="workflow-summary-lead">{describeTrace(log)}</p>
      {entries.length ? (
        <div className="cards setting-card-grid">
          {entries.map((entry) => (
            <details className="asset-card" key={entry.id}>
              <summary className="io-log-summary">
                <div>
                  <strong>{entry.title}</strong>
                  <small>{entry.summary || "查看结构化输出"}</small>
                </div>
              </summary>
              <pre className="io-log-pre">{formatJsonBlock(entry.body)}</pre>
            </details>
          ))}
        </div>
      ) : (
        <pre className="io-log-pre">{formatJsonBlock(log.outputPayload || log.outputText || {})}</pre>
      )}
    </article>
  );
}

export function ResearchTracePanel({ title, log = null, emptyText, describeTrace }) {
  if (!log) {
    return (
      <article className="panel">
        <div className="panel-title compact">
          <div>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="workflow-empty">{emptyText}</p>
      </article>
    );
  }

  return (
    <article className="panel">
      <div className="panel-title compact">
        <div>
          <h2>{title}</h2>
          <span>{formatTime(log.createdAt)}</span>
        </div>
      </div>
      <p className="workflow-summary-lead">{describeTrace(log)}</p>
      <pre className="io-log-pre">{log.outputText || formatJsonBlock(log.outputPayload || {})}</pre>
    </article>
  );
}
