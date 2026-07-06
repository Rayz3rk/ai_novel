export function listHumanizerSkills(skills = []) {
  return (Array.isArray(skills) ? skills : []).filter((item) => item.supportsHumanize);
}

export function buildHumanizeSkillSummary(skills = []) {
  const humanizers = listHumanizerSkills(skills);
  if (!humanizers.length) return "未检测到可兼容的人类化 skill，将回退到内置规则。";
  return `已检测到 ${humanizers.length} 个兼容 skill：${humanizers.map((item) => item.name).join(" / ")}`;
}

export function findSkillById(skills = [], skillId = "") {
  return (Array.isArray(skills) ? skills : []).find((item) => item.id === skillId) || null;
}

export function mapSkillCompatibilityLabel(value) {
  if (value === "codex-skill") return "Codex Skill";
  if (value === "claude-skill") return "Claude Skill";
  if (value === "codex-agents") return "AGENTS.md";
  if (value === "claude-memory") return "CLAUDE.md";
  return value;
}

export function mapSkillSupportKindLabel(value) {
  if (value === "reference") return "Reference";
  if (value === "agent") return "Agent Config";
  if (value === "plugin") return "Plugin Meta";
  if (value === "readme") return "README";
  return "Support";
}
