import { Boxes, CircleDot, Flame, MapPinned, Users } from "lucide-react";

export const settingTypes = [
  { id: "character", label: "角色", icon: Users },
  { id: "world", label: "世界观", icon: Boxes },
  { id: "location", label: "地点", icon: MapPinned },
  { id: "item", label: "道具", icon: CircleDot },
  { id: "power", label: "能力体系", icon: Flame }
];

export const genreOptions = ["玄幻", "言情", "悬疑", "都市", "短剧化小说", "同人 / OC"];

export const rewriteStyles = [
  "更网文化",
  "更文学化",
  "更紧凑",
  "更暧昧",
  "更克制",
  "更热血",
  "更悬疑",
  "更短剧化"
];

export const constraintPolicyOptions = [
  {
    id: "lockCharacterMotivations",
    label: "锁人物动机",
    description: "把已选角色的核心动机压进本章约束，减少人设漂移。"
  },
  {
    id: "strictWorldRules",
    label: "锁世界规则",
    description: "把能力、世界观和禁忌规则显式写入约束，避免越界。"
  },
  {
    id: "lockRecentContinuity",
    label: "锁最近连续性",
    description: "强制承接最近章节的事实、情绪和关系走向。"
  },
  {
    id: "enforceForeshadowContinuity",
    label: "锁伏笔照应",
    description: "把未回收伏笔压进 continuity，减少遗漏和断线。"
  }
];

export const workflowStageLabels = {
  mcp_research: "MCP Research",
  subagents: "Sub-agent Team",
  planner: "Planner",
  guard_preflight: "Preflight Guard",
  writer: "Writer",
  "writer-local": "Writer",
  guard: "Post Guard",
  repair: "Repair",
  humanize: "Humanize",
  review_session: "生成章节审阅稿",
  review_commit: "审阅后入库",
  discard: "丢弃审阅稿"
};

export const downloadFormatOptions = [
  { value: "txt", label: "TXT" },
  { value: "markdown", label: "Markdown" },
  { value: "docx", label: "Word" },
  { value: "pdf", label: "PDF" },
  { value: "epub", label: "EPUB" }
];
