import React, { useMemo } from "react";
import { Boxes, BrainCircuit, ChevronRight } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import {
  buildHumanizeSkillSummary,
  findSkillById,
  listHumanizerSkills,
  mapSkillCompatibilityLabel,
  mapSkillSupportKindLabel
} from "./skill-utils.js";

export function SkillsTab({ project, skills = [] }) {
  const humanizerSkills = useMemo(() => listHumanizerSkills(skills), [skills]);
  const activeHumanizer = useMemo(
    () => findSkillById(humanizerSkills, project.humanizeSkillId),
    [humanizerSkills, project.humanizeSkillId]
  );

  return (
    <section className="cards">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Compatibility Layer</p>
            <h2>Skills 兼容状态</h2>
          </div>
          <Boxes size={20} />
        </div>
        <div className="skills-summary-column">
          <details className="asset-card skill-collapse-card" open>
            <summary className="skill-collapse-summary">
              <div className="skill-collapse-summary-main">
                <div>
                  <h3>兼容层概览</h3>
                  <small>本地技能扫描与提示型注入能力</small>
                </div>
                <p className="skill-collapse-description">
                  当前框架已经能扫描本地 `skills/`，识别 `SKILL.md`、`AGENTS.md`、`CLAUDE.md` 及其附属
                  `references/`、`agents/` 资源，并把它们接到提示型工作流里。
                </p>
              </div>
              <ChevronRight size={18} className="skill-collapse-chevron" />
            </summary>
            <div className="skill-collapse-body">
              <div className="editor-footer">
                <span>已识别 skills：{skills.length}</span>
                <span>可用于降 AI 率：{humanizerSkills.length}</span>
                <span>当前项目：{project.humanizeEnabled === false ? "已关闭 humanize" : "已开启 humanize"}</span>
              </div>
              <small>
                兼容范围目前是提示型 skill 注入 + 本项目内置 MCP / 子 agent 编排；Claude Code / Codex 原生执行语义仍未兼容。
              </small>
            </div>
          </details>

          <details className="asset-card skill-collapse-card" open>
            <summary className="skill-collapse-summary">
              <div className="skill-collapse-summary-main">
                <div>
                  <h3>当前项目绑定</h3>
                  <small>当前人类化策略与默认行为</small>
                </div>
                <p className="skill-collapse-description">
                  {project.humanizeEnabled === false
                    ? "该项目已关闭最终降 AI 率步骤。"
                    : activeHumanizer
                      ? `当前固定使用 ${activeHumanizer.name}。`
                      : "当前使用自动匹配，会按文本语言与 skill 能力选择。"}
                </p>
              </div>
              <ChevronRight size={18} className="skill-collapse-chevron" />
            </summary>
            <div className="skill-collapse-body">
              <div className="editor-footer">
                <span>默认模式：{project.humanizeEnabled === false ? "关闭" : "自动 / 启用"}</span>
                <span>当前绑定：{activeHumanizer?.name || "自动匹配"}</span>
              </div>
              <small>{buildHumanizeSkillSummary(skills)}</small>
            </div>
          </details>
        </div>
      </div>

      <div className="panel result-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Detected Skills</p>
            <h2>本地技能目录</h2>
          </div>
          <BrainCircuit size={20} />
        </div>
        {skills.length ? (
          <div className="skills-directory-grid">
            {skills.map((skill) => (
              <details className="asset-card skill-collapse-card skill-directory-card" key={skill.id}>
                <summary className="skill-collapse-summary">
                  <div className="skill-collapse-summary-main">
                    <div className="skill-card-header">
                      <div>
                        <h3>{skill.name}</h3>
                        <small>{skill.sourceType} · {skill.promptFile}</small>
                      </div>
                      {skill.supportsHumanize ? <span className="tag">Humanize</span> : null}
                    </div>
                    <p className="skill-collapse-description">{skill.description || "该 skill 未提供描述。"}</p>
                    <div className="editor-footer">
                      <span>{skill.isZh ? "中文优先" : "英文优先"}</span>
                      <span>References：{skill.referenceCount || 0}</span>
                      <span>Support Files：{skill.supportFiles?.length || 0}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="skill-collapse-chevron" />
                </summary>
                <div className="skill-collapse-body">
                  <div className="workflow-pill-list">
                    {(skill.compatibility || []).map((item) => (
                      <span className="workflow-pill" key={`${skill.id}-${item}`}>
                        {mapSkillCompatibilityLabel(item)}
                      </span>
                    ))}
                  </div>
                  {skill.voiceOptions?.length ? (
                    <div className="workflow-pill-list">
                      {skill.voiceOptions.slice(0, 8).map((voice) => (
                        <span className="workflow-pill" key={`${skill.id}-voice-${voice}`}>
                          {voice}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {skill.supportFiles?.length ? (
                    <div className="skill-support-list">
                      {skill.supportFiles.slice(0, 8).map((item) => (
                        <div className="skill-support-item" key={`${skill.id}-${item.path}`}>
                          <strong>{mapSkillSupportKindLabel(item.kind)}</strong>
                          <span>{item.path}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState text="还没有识别到本地 skill。把 Claude Code / Codex 风格的 skill 放进 skills/ 后，刷新即可出现在这里。" />
        )}
      </div>
    </section>
  );
}
