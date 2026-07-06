import React, { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { ToneComposer } from "../../components/ToneComposer.jsx";
import { useWebDraftState } from "../../hooks/useWebDraftState.js";
import { makeWebDraftKey } from "../../lib/webDraft.js";
import { buildHumanizeSkillSummary, listHumanizerSkills } from "../skills/skill-utils.js";

export function ProjectTonePanel({ project, mutate, working, skills = [] }) {
  const toneDraftKey = useMemo(() => makeWebDraftKey(project.id, "studio-tone"), [project.id]);
  const [tone, setTone] = useWebDraftState(toneDraftKey, project.defaultTone || "热血");
  const humanizerSkills = useMemo(() => listHumanizerSkills(skills), [skills]);
  const [humanizeEnabled, setHumanizeEnabled] = useState(project.humanizeEnabled !== false);
  const [humanizeSkillId, setHumanizeSkillId] = useState(project.humanizeSkillId || "");

  useEffect(() => {
    setHumanizeEnabled(project.humanizeEnabled !== false);
    setHumanizeSkillId(project.humanizeSkillId || "");
  }, [project.humanizeEnabled, project.humanizeSkillId]);

  async function submit(event) {
    event.preventDefault();
    if (!tone.trim()) return;
    await mutate(
      `/api/projects/${project.id}/preferences`,
      {
        defaultTone: tone,
        humanizeEnabled,
        humanizeSkillId
      },
      "保存项目语气"
    );
  }

  return (
    <form className="editor-form" onSubmit={submit}>
      <label>
        当前默认语气
        <ToneComposer value={tone} onChange={setTone} placeholder="例如：热血压迫感、冷感克制" />
      </label>
      <label className="inline-check">
        <input type="checkbox" checked={humanizeEnabled} onChange={(event) => setHumanizeEnabled(event.target.checked)} />
        默认在终稿阶段追加一轮 AI 润色
      </label>
      <label>
        Humanize Skill
        <select value={humanizeSkillId} onChange={(event) => setHumanizeSkillId(event.target.value)}>
          <option value="">自动匹配（按内容选择最合适的技能）</option>
          {humanizerSkills.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </select>
      </label>
      <small className="ai-config-hint">
        {buildHumanizeSkillSummary(skills)}
        当前兼容层支持 `SKILL.md` / `AGENTS.md` / `CLAUDE.md` 这类提示型 skill，MCP、工具调用和子 agent 编排走本项目内置适配层。
      </small>
      <button className="primary-button" type="submit" disabled={Boolean(working)}>
        <Save size={16} />
        保存项目语气
      </button>
    </form>
  );
}
