import React, { useMemo, useState } from "react";
import {
  ChevronRight,
  Edit3,
  Library,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2
} from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import { useWebDraftState } from "../../hooks/useWebDraftState.js";
import { makeWebDraftKey } from "../../lib/webDraft.js";

function FieldAssist({ project, mutate, working, section, fieldLabel, value, guidance, onApply }) {
  async function run(mode) {
    const actionLabel = `${mode === "expand" ? "扩写" : "润色"}${fieldLabel}`;
    const data = await mutate(
      `/api/projects/${project.id}/assist`,
      {
        section,
        fieldLabel,
        source: value,
        mode,
        guidance
      },
      actionLabel
    );
    if (data.assistResult) onApply(data.assistResult);
  }

  return (
    <div className="field-assist">
      <button type="button" disabled={Boolean(working)} onClick={() => run("expand")}>
        <Sparkles size={14} />
        扩写
      </button>
      <button type="button" disabled={Boolean(working)} onClick={() => run("polish")}>
        <Wand2 size={14} />
        润色
      </button>
    </div>
  );
}

function TagInput({ value, onChange, placeholder = "输入标签后回车", normalizeTagList, stringifyTagList }) {
  const tags = normalizeTagList(value);
  const [draft, setDraft] = useState("");

  function commit(nextValue = draft) {
    const nextTags = normalizeTagList([...tags, ...normalizeTagList(nextValue)]);
    if (!nextTags.length && !tags.length) return;
    onChange(stringifyTagList(nextTags));
    setDraft("");
  }

  function removeTag(tag) {
    onChange(stringifyTagList(tags.filter((item) => item !== tag)));
  }

  function handleKeyDown(event) {
    if (!["Enter", ",", "，", ".", "。", ";", "；"].includes(event.key)) return;
    event.preventDefault();
    if (!draft.trim()) return;
    commit();
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor-pills">
        {tags.length ? (
          tags.map((tag) => (
            <button
              className="tag-editor-chip"
              key={tag}
              type="button"
              onClick={() => removeTag(tag)}
              title={`移除标签 ${tag}`}
            >
              <span>{tag}</span>
              <small>删除</small>
            </button>
          ))
        ) : (
          <span className="tag-editor-empty">还没有标签，输入后回车即可添加。</span>
        )}
      </div>
      <div className="tag-editor-input">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <button type="button" onClick={() => commit()} disabled={!draft.trim()}>
          添加
        </button>
      </div>
    </div>
  );
}

function TagList({ value, normalizeTagList }) {
  const tags = normalizeTagList(value);
  if (!tags.length) return null;

  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <span className="tag" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}

export function BibleTab({
  project,
  mutate,
  working,
  onOpenSettingExtractor,
  settingTypes,
  useSettingDraftState = useWebDraftState,
  buildSettingDraft,
  sortSettings,
  normalizeTagList,
  stringifyTagList,
  formatSettingCode
}) {
  const bibleFormKey = useMemo(() => makeWebDraftKey(project.id, "bible-form"), [project.id]);
  const bibleQueryKey = useMemo(() => makeWebDraftKey(project.id, "bible-query"), [project.id]);
  const bibleEditKey = useMemo(() => makeWebDraftKey(project.id, "bible-edit"), [project.id]);
  const bibleSectionsKey = useMemo(() => makeWebDraftKey(project.id, "bible-sections"), [project.id]);
  const [form, setForm, resetForm] = useSettingDraftState(bibleFormKey, {
    type: "character",
    name: "",
    summary: "",
    traits: "",
    rules: ""
  });
  const [query, setQuery] = useSettingDraftState(bibleQueryKey, "");
  const [editState, setEditState] = useSettingDraftState(bibleEditKey, {
    activeId: "",
    expandedId: "",
    drafts: {}
  });
  const [collapsedSections, setCollapsedSections] = useSettingDraftState(
    bibleSectionsKey,
    Object.fromEntries(settingTypes.map((type) => [type.id, false]))
  );
  const normalizedQuery = query.trim().toLowerCase();
  const activeEditId = editState.activeId || "";
  const expandedId = editState.expandedId || "";
  const editDrafts = editState.drafts || {};

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.summary.trim()) return;
    await mutate(
      `/api/projects/${project.id}/settings`,
      { ...form, traits: stringifyTagList(form.traits) },
      "新增设定"
    );
    resetForm({ type: form.type, name: "", summary: "", traits: "", rules: "" });
  }

  function startEdit(item) {
    setCollapsedSections((current) => ({
      ...(current || {}),
      [item.type]: false
    }));
    setEditState((current) => ({
      activeId: item.id,
      expandedId: item.id,
      drafts: {
        ...(current?.drafts || {}),
        [item.id]: current?.drafts?.[item.id] || buildSettingDraft(item)
      }
    }));
  }

  function collapseEdit() {
    setEditState((current) => ({ ...current, activeId: "" }));
  }

  function resetEditDraft(item) {
    setEditState((current) => ({
      activeId: item.id,
      drafts: {
        ...(current?.drafts || {}),
        [item.id]: buildSettingDraft(item)
      }
    }));
  }

  function updateEditDraft(item, patch) {
    setEditState((current) => ({
      activeId: item.id,
      drafts: {
        ...(current?.drafts || {}),
        [item.id]: {
          ...(current?.drafts?.[item.id] || buildSettingDraft(item)),
          ...patch
        }
      }
    }));
  }

  async function saveEdit(item) {
    const draft = editDrafts[item.id] || buildSettingDraft(item);
    if (!draft.name.trim() || !draft.summary.trim()) return;

    await mutate(
      `/api/projects/${project.id}/settings/${item.id}`,
      { ...draft, traits: stringifyTagList(draft.traits) },
      "保存设定修改"
    );
    setEditState((current) => {
      const nextDrafts = { ...(current?.drafts || {}) };
      delete nextDrafts[item.id];
      return {
        activeId: current?.activeId === item.id ? "" : current?.activeId || "",
        expandedId: item.id,
        drafts: nextDrafts
      };
    });
  }

  async function deleteSetting(item) {
    if (!window.confirm(`确认删除“${item.name}”这条设定吗？此操作不可撤销。`)) return;

    await mutate(`/api/projects/${project.id}/settings/${item.id}/delete`, {}, "删除设定");
    setEditState((current) => {
      const nextDrafts = { ...(current?.drafts || {}) };
      delete nextDrafts[item.id];
      return {
        activeId: current?.activeId === item.id ? "" : current?.activeId || "",
        expandedId: current?.expandedId === item.id ? "" : current?.expandedId || "",
        drafts: nextDrafts
      };
    });
  }

  function toggleSection(sectionId) {
    setCollapsedSections((current) => ({
      ...(current || {}),
      [sectionId]: !current?.[sectionId]
    }));
  }

  function toggleSettingCard(item) {
    setCollapsedSections((current) => ({
      ...(current || {}),
      [item.type]: false
    }));
    setEditState((current) => {
      const isSameCard = current?.expandedId === item.id;
      return {
        ...current,
        activeId: isSameCard && current?.activeId === item.id ? "" : current?.activeId || "",
        expandedId: isSameCard ? "" : item.id,
        drafts: current?.drafts || {}
      };
    });
  }

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Story Bible</p>
            <h2>设定库</h2>
          </div>
          <div className="panel-title-actions">
            <button className="secondary-button" type="button" onClick={() => onOpenSettingExtractor?.()}>
              <Sparkles size={16} />
              提取设定
            </button>
            <Library size={20} />
          </div>
        </div>
        <form className="editor-form" onSubmit={submit}>
          <label>
            设定类型
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {settingTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            名称
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="例如：角色名、地点名、门派名、能力体系名"
            />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="名称"
              value={form.name}
              guidance="补足命名风格，使其贴合项目世界观和题材。"
              onApply={(name) => setForm((current) => ({ ...current, name }))}
            />
          </label>
          <label>
            摘要
            <textarea
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              rows={5}
              placeholder="简要描述这条设定的定义、用途、背景和与剧情的关系。"
            />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="摘要"
              value={form.summary}
              guidance="补全关键背景信息，但尽量保持摘要紧凑可检索。"
              onApply={(summary) => setForm((current) => ({ ...current, summary }))}
            />
          </label>
          <label>
            标签 / 特征
            <TagInput
              value={form.traits}
              onChange={(traits) => setForm((current) => ({ ...current, traits }))}
              placeholder="输入标签后回车，例如：冷峻、失忆、旧王朝"
              normalizeTagList={normalizeTagList}
              stringifyTagList={stringifyTagList}
            />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="标签 / 特征"
              value={form.traits}
              guidance="输出 3 到 6 个高识别度标签，避免重复和空泛描述。"
              onApply={(traits) => setForm((current) => ({ ...current, traits: stringifyTagList(traits) }))}
            />
          </label>
          <label>
            规则 / 约束
            <textarea
              value={form.rules}
              onChange={(event) => setForm({ ...form, rules: event.target.value })}
              rows={3}
              placeholder="写明禁忌、代价、边界条件或使用规则。"
            />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="规则 / 约束"
              value={form.rules}
              guidance="提炼最关键的边界条件，减少后续剧情冲突。"
              onApply={(rules) => setForm((current) => ({ ...current, rules }))}
            />
          </label>
          <button className="primary-button" disabled={Boolean(working)} type="submit">
            <Plus size={17} />
            新增设定
          </button>
        </form>
      </div>

      <div className="asset-list">
        <div className="list-toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="按名称、摘要、标签或规则搜索"
          />
        </div>
        {settingTypes.map((type) => {
          const Icon = type.icon;
          const items = sortSettings(project.settings).filter((item) => {
            if (item.type !== type.id) return false;
            if (item.id === activeEditId) return true;
            if (!normalizedQuery) return true;
            return [item.name, item.summary, item.traits, item.rules].some((value) =>
              String(value || "").toLowerCase().includes(normalizedQuery)
            );
          });
          const isCollapsed = Boolean(collapsedSections[type.id]) && !normalizedQuery;

          return (
            <div className="panel" key={type.id}>
              <div className="panel-title compact">
                <h2><Icon size={18} />{type.label}</h2>
                <div className="panel-title-actions">
                  <span>{items.length}</span>
                  <button
                    className="section-toggle"
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "展开" : "收起"}${type.label}`}
                    onClick={() => toggleSection(type.id)}
                  >
                    <ChevronRight size={16} />
                    {isCollapsed ? "展开" : "收起"}
                  </button>
                </div>
              </div>
              {isCollapsed && items.length ? (
                <div className="collapsed-hint">该分类已折叠，点击右上角可展开查看卡片。</div>
              ) : items.length ? (
                <div className="cards setting-card-grid">
                  {items.map((item) => {
                    const isEditing = activeEditId === item.id;
                    const isExpanded = isEditing || expandedId === item.id;
                    const editDraft = editDrafts[item.id] || buildSettingDraft(item);

                    return (
                      <article className={`asset-card setting-card ${isExpanded ? "expanded" : ""} ${isEditing ? "editing" : ""}`} key={item.id}>
                        <button
                          className="setting-card-toggle"
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleSettingCard(item)}
                        >
                          <div className="setting-card-heading">
                            <span className="setting-code-badge">{formatSettingCode(item)}</span>
                            <h3>{item.name}</h3>
                          </div>
                          <div className="setting-card-meta">
                            <small>
                              {isExpanded
                                ? "收起详情"
                                : item.rules
                                  ? "含规则约束"
                                  : "点击展开详情"}
                            </small>
                            <ChevronRight size={16} />
                          </div>
                        </button>
                        {isEditing ? (
                          <form
                            className="editor-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveEdit(item).catch(() => {});
                            }}
                          >
                            <label>
                              设定类型
                              <select value={editDraft.type} onChange={(event) => updateEditDraft(item, { type: event.target.value })}>
                                {settingTypes.map((settingType) => (
                                  <option key={settingType.id} value={settingType.id}>
                                    {settingType.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              名称
                              <input value={editDraft.name} onChange={(event) => updateEditDraft(item, { name: event.target.value })} />
                            </label>
                            <label>
                              摘要
                              <textarea value={editDraft.summary} onChange={(event) => updateEditDraft(item, { summary: event.target.value })} rows={5} />
                            </label>
                            <label>
                              标签 / 特征
                              <TagInput
                                value={editDraft.traits}
                                onChange={(traits) => updateEditDraft(item, { traits })}
                                placeholder="输入标签后回车"
                                normalizeTagList={normalizeTagList}
                                stringifyTagList={stringifyTagList}
                              />
                            </label>
                            <label>
                              规则 / 约束
                              <textarea value={editDraft.rules} onChange={(event) => updateEditDraft(item, { rules: event.target.value })} rows={3} />
                            </label>
                            <div className="card-actions">
                              <button className="primary-button" type="submit" disabled={Boolean(working)}>
                                <Save size={16} />
                                保存修改
                              </button>
                              <button
                                className="danger-button"
                                type="button"
                                disabled={Boolean(working)}
                                onClick={() => deleteSetting(item)}
                              >
                                <Trash2 size={16} />
                                删除设定
                              </button>
                              <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => resetEditDraft(item)}>
                                重置
                              </button>
                              <button className="secondary-button" type="button" onClick={collapseEdit}>
                                收起编辑
                              </button>
                            </div>
                          </form>
                        ) : (
                          isExpanded && (
                            <div className="setting-card-body">
                              <p>{item.summary}</p>
                              <TagList value={item.traits} normalizeTagList={normalizeTagList} />
                              {item.rules && <small>{item.rules}</small>}
                              <div className="card-actions">
                                <button className="secondary-button" type="button" onClick={() => startEdit(item)}>
                                  <Edit3 size={16} />
                                  编辑设定
                                </button>
                                <button className="danger-button" type="button" disabled={Boolean(working)} onClick={() => deleteSetting(item)}>
                                  <Trash2 size={16} />
                                  删除设定
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState text="暂无设定。" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
