import React from "react";
import { BrainCircuit, MessageSquareText } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";

export function IoLogsTab({ project, formatTime, formatJsonBlock }) {
  const logs = project.ioLogs || [];

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Workflow Config</p>
            <h2>工作流 I/O 日志</h2>
          </div>
          <BrainCircuit size={20} />
        </div>
        <p>
          这里集中查看各类工作流的输入输出，包括 planner、writer、guard、repair、humanize 等阶段。
          具体模型与策略配置仍以 <code>server/ai-config.js</code> 为准，日志面板主要用于排查问题和追踪每次执行过程。
        </p>
        <div className="editor-footer">
          <span>配置文件：server/ai-config.js</span>
          <span>日志条数：{logs.length}</span>
        </div>
      </div>

      <div className="panel result-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Recent Logs</p>
            <h2>I/O 记录</h2>
          </div>
          <MessageSquareText size={20} />
        </div>
        {logs.length ? (
          <div className="io-log-list">
            {logs.map((log) => {
              const chapter = project.chapters.find((item) => item.id === log.chapterId);
              return (
                <details className="io-log-card" key={log.id}>
                  <summary className="io-log-summary">
                    <div>
                      <strong>{log.workflow} / {log.stage}</strong>
                      <small>{formatTime(log.createdAt)}</small>
                    </div>
                    <span className={`io-log-status ${log.status}`}>
                      {log.status === "error" ? "失败" : "成功"}
                    </span>
                  </summary>
                  <div className="io-log-meta">
                    <span>{chapter ? `第 ${chapter.number} 章 · ${chapter.title}` : "未关联章节"}</span>
                    <span>{log.provider || "local"}{log.model ? ` / ${log.model}` : ""}</span>
                  </div>
                  <div className="io-log-grid">
                    <div>
                      <strong>输入</strong>
                      <pre className="io-log-pre">{formatJsonBlock(log.inputPayload)}</pre>
                    </div>
                    <div>
                      <strong>输出</strong>
                      <pre className="io-log-pre">{log.outputText || formatJsonBlock(log.outputPayload)}</pre>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState text="还没有 I/O 日志，执行一次生成、改写或审阅后会出现在这里。" />
        )}
      </div>
    </section>
  );
}
