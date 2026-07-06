import React, { useMemo } from "react";
import { GitBranch, Plus } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import { useWebDraftState } from "../../hooks/useWebDraftState.js";
import { makeWebDraftKey } from "../../lib/webDraft.js";

const FORESHADOW_STATUSES = ["全部", "未回收", "回收中", "已回收"];

export function ThreadsTab({ project, mutate, working, buildForeshadowDraft }) {
  const threadFormKey = useMemo(() => makeWebDraftKey(project.id, "threads-form"), [project.id]);
  const threadFilterKey = useMemo(() => makeWebDraftKey(project.id, "threads-filter"), [project.id]);
  const [form, setForm, resetForm] = useWebDraftState(threadFormKey, buildForeshadowDraft());
  const [statusFilter, setStatusFilter] = useWebDraftState(threadFilterKey, "全部");
  const visibleForeshadows = project.foreshadows.filter(
    (item) => statusFilter === "全部" || item.status === statusFilter
  );

  async function submit(event) {
    event.preventDefault();
    if (!form.content.trim()) return;
    await mutate(`/api/projects/${project.id}/foreshadows`, form, "记录伏笔");
    resetForm(buildForeshadowDraft());
  }

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Foreshadow</p>
            <h2>伏笔线程</h2>
          </div>
          <GitBranch size={20} />
        </div>
        <form className="editor-form" onSubmit={submit}>
          <label>
            伏笔内容
            <textarea
              rows={4}
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              placeholder="写下需要后续呼应的伏笔、悬念或隐藏信息"
            />
          </label>
          <div className="form-row">
            <label>
              埋设章节
              <input
                value={form.plantedChapter}
                onChange={(event) => setForm({ ...form, plantedChapter: event.target.value })}
                placeholder="第 3 章"
              />
            </label>
            <label>
              预计回收章节
              <input
                value={form.expectedPayoff}
                onChange={(event) => setForm({ ...form, expectedPayoff: event.target.value })}
                placeholder="第 12 章"
              />
            </label>
          </div>
          <label>
            关联角色 / 道具 / 线索
            <input
              value={form.related}
              onChange={(event) => setForm({ ...form, related: event.target.value })}
              placeholder="例如：沈照夜、归墟灯、师父失踪"
            />
          </label>
          <label>
            状态
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {FORESHADOW_STATUSES.slice(1).map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={Boolean(working)} type="submit">
            <Plus size={17} />
            新增伏笔
          </button>
        </form>
      </div>

      <div className="thread-board">
        <div className="list-toolbar segmented">
          {FORESHADOW_STATUSES.map((status) => (
            <button
              key={status}
              className={statusFilter === status ? "active" : ""}
              onClick={() => setStatusFilter(status)}
              type="button"
            >
              {status}
            </button>
          ))}
        </div>
        {visibleForeshadows.length ? (
          visibleForeshadows.map((item) => (
            <article className={`thread-card ${item.status === "已回收" ? "done" : ""}`} key={item.id}>
              <header>
                <span>{item.status}</span>
                <strong>{item.plantedChapter || "未标章节"}</strong>
              </header>
              <p>{item.content}</p>
              <div className="thread-meta">
                <span>预计回收：{item.expectedPayoff || "未填写"}</span>
                <span>关联：{item.related || "无"}</span>
              </div>
              <div className="card-actions">
                {item.status !== "回收中" && item.status !== "已回收" && (
                  <button
                    className="secondary-button"
                    disabled={Boolean(working)}
                    onClick={() =>
                      mutate(
                        `/api/projects/${project.id}/foreshadows/${item.id}/status`,
                        { status: "回收中" },
                        "标记为回收中"
                      )
                    }
                  >
                    标记回收中
                  </button>
                )}
                {item.status !== "已回收" && (
                  <button
                    className="secondary-button"
                    disabled={Boolean(working)}
                    onClick={() =>
                      mutate(
                        `/api/projects/${project.id}/foreshadows/${item.id}/status`,
                        { status: "已回收" },
                        "标记为已回收"
                      )
                    }
                  >
                    标记已回收
                  </button>
                )}
              </div>
              {item.warning && <small className="warning-text">{item.warning}</small>}
            </article>
          ))
        ) : (
          <EmptyState text="还没有伏笔线程。" />
        )}
      </div>
    </section>
  );
}
