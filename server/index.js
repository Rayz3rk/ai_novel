import "dotenv/config";
import cors from "cors";
import express from "express";
import pg from "pg";
import {
  buildAssistMessages,
  buildChapterGuardMessages,
  buildChapterPlannerMessages,
  buildChapterRepairMessages,
  buildChapterWriterMessages,
  buildSettingExtractionMessages,
  buildTransformMessages
} from "./ai-config.js";
import { exportChapterFile, exportProjectFile, setDownloadHeaders } from "./exporters.js";

const { Pool } = pg;

const port = Number(process.env.PORT || 8787);
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/novel";
const APP_PREFERENCES_ID = "singleton";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const VALID_AI_THINKING_MODES = new Set(["", "enabled", "disabled"]);
const VALID_AI_REASONING_EFFORTS = new Set(["", "low", "medium", "high", "max"]);

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

const pool = new Pool({
  connectionString: databaseUrl
});

const now = () => new Date().toISOString();
const id = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const buildProjectDeleteCode = (projectId) =>
  `DEL-${projectId.replace(/^project_/, "").slice(-6).toUpperCase().padStart(6, "0")}`;

function normalizeAiProvider(value, fallback = "local") {
  const next = String(value || "").trim().toLowerCase();
  return next || fallback;
}

function isRemoteAiProvider(value) {
  const provider = normalizeAiProvider(value, "");
  return provider && provider !== "local" && provider !== "mock";
}

function normalizeAiThinkingMode(value, fallback = "") {
  const next = String(value || "").trim().toLowerCase();
  return VALID_AI_THINKING_MODES.has(next) ? next : fallback;
}

function normalizeAiReasoningEffort(value, fallback = "") {
  const next = String(value || "").trim().toLowerCase();
  return VALID_AI_REASONING_EFFORTS.has(next) ? next : fallback;
}

function isDeepSeekConfig(config) {
  const provider = normalizeAiProvider(config?.provider, "");
  const baseUrl = String(config?.baseUrl || config?.base_url || "").trim().toLowerCase();
  const model = String(config?.model || "").trim().toLowerCase();
  return provider === "deepseek" || baseUrl.includes("deepseek.com") || model.startsWith("deepseek");
}

function buildDefaultBaseUrl(provider, currentBaseUrl = "", model = "") {
  if (currentBaseUrl) return currentBaseUrl.replace(/\/$/, "");
  if (isDeepSeekConfig({ provider, baseUrl: currentBaseUrl, model })) return DEFAULT_DEEPSEEK_BASE_URL;
  return normalizeAiProvider(provider, "") === "openai" ? DEFAULT_OPENAI_BASE_URL : "";
}

function buildEnvAiProfileSnapshot() {
  const provider = normalizeAiProvider(process.env.AI_PROVIDER, "local");
  const baseUrl = buildDefaultBaseUrl(provider, String(process.env.OPENAI_BASE_URL || "").trim(), process.env.AI_MODEL);
  const model = String(process.env.AI_MODEL || "").trim();
  const isDeepSeek = isDeepSeekConfig({ provider, baseUrl, model });

  return {
    id: "env_default",
    name: process.env.AI_PROFILE_NAME || "\u9ed8\u8ba4\u914d\u7f6e",
    provider,
    apiKey: String(process.env.OPENAI_API_KEY || "").trim(),
    baseUrl,
    model,
    thinkingMode: normalizeAiThinkingMode(process.env.AI_THINKING_MODE, isDeepSeek ? "enabled" : ""),
    reasoningEffort: normalizeAiReasoningEffort(process.env.AI_REASONING_EFFORT, isDeepSeek ? "high" : ""),
    createdAt: now(),
    updatedAt: now()
  };
}

function sanitizeAiProfileInput(input, fallbackProfile = null) {
  const fallback = fallbackProfile || buildEnvAiProfileSnapshot();
  const provider = normalizeAiProvider(input?.provider, fallback.provider || "local");
  const model = String(input?.model ?? fallback.model ?? "").trim();
  const baseUrlInput = String(input?.baseUrl ?? fallback.baseUrl ?? "").trim();
  const baseUrl = buildDefaultBaseUrl(provider, baseUrlInput, model);
  const apiKey = String(input?.apiKey ?? fallback.apiKey ?? "").trim();
  const name = String(input?.name ?? fallback.name ?? "").trim() || "\u672a\u547d\u540d\u914d\u7f6e";
  const isDeepSeek = isDeepSeekConfig({ provider, baseUrl, model });

  return {
    name,
    provider,
    apiKey,
    baseUrl,
    model,
    thinkingMode: normalizeAiThinkingMode(input?.thinkingMode, isDeepSeek ? "enabled" : fallback.thinkingMode || ""),
    reasoningEffort: normalizeAiReasoningEffort(
      input?.reasoningEffort,
      isDeepSeek ? "high" : fallback.reasoningEffort || ""
    )
  };
}

const draftFallback = (draftValue, savedValue, hasDraft) => {
  if (!hasDraft) return savedValue || "";
  return typeof draftValue === "string" ? draftValue : savedValue || "";
};

const normalizeTone = (value, fallback = "热血") => {
  const next = String(value || "").trim();
  return next || fallback;
};

const normalizeTransformMode = (value) => (String(value || "").trim().toLowerCase() === "modify" ? "modify" : "polish");

const CHAPTER_TITLE_PATTERN =
  /^第\s*[零〇一二三四五六七八九十百千万两\d]+\s*章(?:\s*[：:\-·.、]?\s*|[《「【]?)?(.*?)[》」】]?$/;

const SETTING_TYPE_ORDER = ["character", "world", "location", "item", "power"];
const SETTING_TYPE_LABELS = {
  character: "角色",
  world: "世界观",
  location: "地点",
  item: "道具",
  power: "能力体系"
};
const SETTING_TYPE_CODES = {
  character: "CHAR",
  world: "WORLD",
  location: "LOC",
  item: "ITEM",
  power: "POWER"
};
const VALID_SETTING_TYPES = new Set(SETTING_TYPE_ORDER);

function computeNextChapterNumber(project) {
  return (
    project.chapters.reduce((max, chapter) => Math.max(max, Number(chapter.number) || 0), 0) + 1
  );
}

function sanitizeChapterTitle(value, chapterNumber) {
  const title = String(value || "").trim();
  if (!title) return `第 ${chapterNumber} 章`;
  const match = title.match(CHAPTER_TITLE_PATTERN);
  if (!match) return title;
  const bareTitle = match[1]?.trim();
  return bareTitle || `第 ${chapterNumber} 章`;
}

function buildChapterHeading(chapterNumber, title) {
  return title && title !== `第 ${chapterNumber} 章`
    ? `第 ${chapterNumber} 章 ${title}`
    : `第 ${chapterNumber} 章`;
}

function summarizeConstraintText(value, limit = 88) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function normalizeConstraintPolicy(policy = {}) {
  return {
    strictWorldRules: policy?.strictWorldRules !== false,
    lockCharacterMotivations: policy?.lockCharacterMotivations !== false,
    enforceForeshadowContinuity: policy?.enforceForeshadowContinuity !== false,
    lockRecentContinuity: policy?.lockRecentContinuity !== false
  };
}

function buildConstraintLayers(project, input, chapterNumber, title) {
  const policy = normalizeConstraintPolicy(input.constraintPolicy);
  const selectedSettings = getSelectedSettings(project, input.selectedSettingIds).slice(0, 6);
  const selectedCharacters = selectedSettings.filter((item) => item.type === "character").slice(0, 3);
  const ruleBoundSettings = selectedSettings.filter((item) => item.rules).slice(0, 4);
  const recentChapters = [...(project.chapters || [])]
    .filter((chapter) => chapter.id !== input.chapterId)
    .sort((left, right) => (Number(left.number) || 0) - (Number(right.number) || 0))
    .slice(-2);
  const activeForeshadows = (project.foreshadows || [])
    .filter((item) => item.status !== "已回收")
    .slice(0, 3);

  return {
    policy,
    chapterIdentity: [
      `只能写第 ${chapterNumber} 章，不能漂移到其他章节`,
      `正文首行必须是：${buildChapterHeading(chapterNumber, title)}`,
      title && title !== `第 ${chapterNumber} 章` ? `标题意象：${title}` : ""
    ].filter(Boolean),
    characterMotivations: policy.lockCharacterMotivations
      ? selectedCharacters.map((item) =>
          `${formatSettingLabel(item)}：${summarizeConstraintText(item.summary || item.rules || "保持既有人物动机")}`
        )
      : [],
    worldRules: policy.strictWorldRules
      ? ruleBoundSettings.map((item) =>
          `${formatSettingLabel(item)}：${summarizeConstraintText(item.rules || item.summary)}`
        )
      : [],
    continuityAnchors: policy.lockRecentContinuity
      ? recentChapters.map((chapter) =>
          [
            `承接第 ${chapter.number} 章：${chapter.title}`,
            chapter.goal ? `目标：${summarizeConstraintText(chapter.goal, 42)}` : "",
            chapter.conflict ? `冲突：${summarizeConstraintText(chapter.conflict, 42)}` : "",
            chapter.hook ? `收束：${summarizeConstraintText(chapter.hook, 42)}` : ""
          ]
            .filter(Boolean)
            .join("｜")
        )
      : [],
    foreshadowAnchors: policy.enforceForeshadowContinuity
      ? activeForeshadows.map((item) =>
          [
            "待照应伏笔",
            item.plantedChapter || "未标章节",
            summarizeConstraintText(item.content, 52)
          ]
            .filter(Boolean)
            .join("｜")
        )
      : [],
    hardBans: mergeWorkflowLists(
      [
        `不能把章节序号写成第 ${chapterNumber} 章之外的其他章节`,
        "不能无代价推翻既有世界规则、能力规则或人物关系"
      ],
      policy.strictWorldRules
        ? ruleBoundSettings.map(
            (item) => `不能违背规则：${formatSettingLabel(item)}：${summarizeConstraintText(item.rules, 56)}`
          )
        : [],
      policy.lockRecentContinuity && recentChapters.length
        ? ["不能否定最近章节已经发生的事实、情绪状态或关系走向"]
        : []
    )
  };
}

function mergeConstraintLayerEntries(...lists) {
  const seen = new Set();
  return lists
    .flat()
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

function isChapterIdentityConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /章节序号|正文首行|标题意象|第\s*\d+\s*章/.test(text);
}

function isContinuityConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /最近章节|已发生|关系走向|情绪状态|承接/.test(text);
}

function isWorldRuleConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /世界规则|能力规则|规则|禁忌|设定|代价|超自然/.test(text);
}

function deriveWorldRulesFromHardBans(layers = {}, policy = {}) {
  if (!policy.strictWorldRules) return [];
  return mergeConstraintLayerEntries(layers?.hardBans || []).filter(
    (item) =>
      isWorldRuleConstraintEntry(item) &&
      !isChapterIdentityConstraintEntry(item) &&
      !isContinuityConstraintEntry(item)
  );
}

function hydrateConstraintLayers(layers = {}, fallbackLayers = {}) {
  const basePolicy = normalizeConstraintPolicy(fallbackLayers?.policy);
  const currentPolicy = normalizeConstraintPolicy(layers?.policy);
  const mergedPolicy = {
    ...basePolicy,
    ...currentPolicy
  };

  return {
    policy: mergedPolicy,
    chapterIdentity: mergeConstraintLayerEntries(
      fallbackLayers?.chapterIdentity || [],
      layers?.chapterIdentity || []
    ),
    characterMotivations: mergeConstraintLayerEntries(
      fallbackLayers?.characterMotivations || [],
      layers?.characterMotivations || []
    ),
    worldRules: mergeConstraintLayerEntries(
      fallbackLayers?.worldRules || [],
      layers?.worldRules || [],
      deriveWorldRulesFromHardBans(fallbackLayers, mergedPolicy),
      deriveWorldRulesFromHardBans(layers, mergedPolicy)
    ),
    continuityAnchors: mergeConstraintLayerEntries(
      fallbackLayers?.continuityAnchors || [],
      layers?.continuityAnchors || []
    ),
    foreshadowAnchors: mergeConstraintLayerEntries(
      fallbackLayers?.foreshadowAnchors || [],
      layers?.foreshadowAnchors || []
    ),
    hardBans: mergeConstraintLayerEntries(fallbackLayers?.hardBans || [], layers?.hardBans || [])
  };
}

function normalizeGeneratedChapterContent(content, chapterNumber, title) {
  const heading = buildChapterHeading(chapterNumber, title);
  const text = String(content || "").trim();
  if (!text) return heading;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim());
  if (firstNonEmptyIndex === -1) return heading;

  if (/^第\s*[零〇一二三四五六七八九十百千万两\d]+\s*章/.test(lines[firstNonEmptyIndex].trim())) {
    lines[firstNonEmptyIndex] = heading;
    return lines.join("\n").trim();
  }

  return [heading, "", text].join("\n");
}

function toStringArray(value, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function padSettingNumber(value) {
  return String(Math.max(1, Number(value) || 0)).padStart(2, "0");
}

function normalizeTraitTags(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[、,，;；/|\n]+/);
  const seen = new Set();

  return items
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item))
    .join("、");
}

function normalizeSettingType(value) {
  const next = String(value || "").trim();
  return VALID_SETTING_TYPES.has(next) ? next : "world";
}

function compareSettingOrder(left, right) {
  const typeDiff =
    SETTING_TYPE_ORDER.indexOf(left.type) - SETTING_TYPE_ORDER.indexOf(right.type);
  if (typeDiff !== 0) return typeDiff;

  const numberDiff = (Number(left.categoryNumber) || 0) - (Number(right.categoryNumber) || 0);
  if (numberDiff !== 0) return numberDiff;

  return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
}

function sortSettings(settings) {
  return [...(settings || [])].sort(compareSettingOrder);
}

function formatSettingCode(setting) {
  const prefix = SETTING_TYPE_CODES[setting?.type] || "SET";
  return `${prefix}-${padSettingNumber(setting?.categoryNumber)}`;
}

function formatSettingLabel(setting) {
  const typeLabel = SETTING_TYPE_LABELS[setting?.type] || "设定";
  return `[${formatSettingCode(setting)}|${typeLabel}] ${setting?.name || "未命名设定"}`;
}

function normalizeSelectedSettingIds(value, project) {
  const availableIds = new Set((project?.settings || []).map((item) => item.id));
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item && availableIds.has(item) && !seen.has(item) && seen.add(item));
}

function countTextUnits(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

function getSelectedSettings(project, selectedSettingIds) {
  const allSettings = sortSettings(project?.settings || []);
  const normalizedIds = normalizeSelectedSettingIds(selectedSettingIds, project);

  if (!normalizedIds.length) {
    return allSettings;
  }

  const settingsById = new Map(allSettings.map((item) => [item.id, item]));
  return normalizedIds.map((item) => settingsById.get(item)).filter(Boolean);
}

async function getNextSettingCategoryNumber(client, projectId, type) {
  const result = await client.query(
    `SELECT COALESCE(MAX(category_number), 0) + 1 AS next_number
     FROM settings
     WHERE project_id = $1 AND type = $2`,
    [projectId, type]
  );
  return Number(result.rows[0]?.next_number) || 1;
}

function guessSettingTypeFromText(text) {
  const source = String(text || "");
  if (/剑|刀|枪|灯|玉|符|书|镜|戒|印|箱|器/.test(source)) return "item";
  if (/城|镇|村|山|谷|海|学院|书院|宗门|王都|宫|殿|楼|馆/.test(source)) return "location";
  if (/术|法|诀|能力|异能|血脉|体系|修行|魔法|天赋/.test(source)) return "power";
  if (/规则|法则|世界|制度|门规|秩序|时代|阵营/.test(source)) return "world";
  if (/他|她|父亲|母亲|老师|医生|律师|教官|主角|少女|少年|老人/.test(source)) {
    return "character";
  }
  return "world";
}

function extractNameFromSentence(text, type, index) {
  const quoted = String(text || "").match(/[《“"「『]?([\u4e00-\u9fa5A-Za-z0-9]{2,18})[》”"」』]/);
  if (quoted?.[1]) return quoted[1];

  const explicit = String(text || "").match(
    /([\u4e00-\u9fa5A-Za-z0-9]{2,18})(?:是|为|叫做|名为|被称为|位于|拥有|负责)/
  );
  if (explicit?.[1]) return explicit[1];

  const leading = String(text || "").split(/[，。；：]/)[0]?.trim();
  if (leading && leading.length <= 18) return leading;

  return `${SETTING_TYPE_LABELS[type] || "设定"}${index + 1}`;
}

function sanitizeSettingExtractionItem(item, index = 0) {
  const summary = String(item?.summary || "").trim();
  const evidence = String(item?.evidence || "").trim();
  const type = normalizeSettingType(item?.type || guessSettingTypeFromText(`${summary}\n${evidence}`));
  const name = String(item?.name || "").trim() || extractNameFromSentence(summary || evidence, type, index);
  const rules = String(item?.rules || "").trim();

  return {
    type,
    name,
    summary,
    traits: normalizeTraitTags(item?.traits),
    rules:
      rules ||
      (/必须|不能|不可|只会|只有|无法|不得/.test(summary) ? summary.replace(/\s+/g, " ") : ""),
    evidence
  };
}

function parseSettingExtractionResult(text) {
  const parsed = parseJsonObject(text);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];

  return items
    .map((item, index) => sanitizeSettingExtractionItem(item, index))
    .filter((item) => item.name && item.summary);
}

function parseJsonObject(text) {
  const source = String(text || "").trim();
  if (!source) return null;

  const candidates = [
    source,
    source.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim()
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1));
        } catch (_nestedError) {
          // Ignore parse failures and continue to the next candidate.
        }
      }
    }
  }

  return null;
}

const seedData = {
  projects: [
    {
      id: "project_seed",
      title: "归墟灯影",
      genre: "玄幻",
      premise: "被废的火系少年靠一盏归墟古灯重写宗门棋局。",
      targetAudience: "网文新人作者",
      status: "连载中",
      defaultTone: "热血压迫感",
      createdAt: now(),
      settings: [
        {
          id: "setting_hero",
          type: "character",
          name: "沈照夜",
          summary:
            "主角，火系灵脉被封，表面隐忍，真实目标是查清师父失踪和宗门血案。",
          traits: "谨慎、火系、复仇、重承诺",
          rules: "不能无代价突破；面对师父线索时会失去部分冷静。",
          createdAt: now()
        },
        {
          id: "setting_lamp",
          type: "item",
          name: "归墟灯",
          summary: "古灯会吸收战场残念，为主角短暂补全火系灵脉。",
          traits: "残念、火、代价",
          rules: "每次使用都会让主角梦见一段失踪师父的记忆。",
          createdAt: now()
        },
        {
          id: "setting_world",
          type: "world",
          name: "九曜宗门制",
          summary:
            "九大宗门按灵脉属性划分地盘，火脉宗近十年衰败，被水脉宗持续压制。",
          traits: "宗门、灵脉、势力制衡",
          rules: "属性克制要保持稳定，水克火、火炼金、金破木。",
          createdAt: now()
        }
      ],
      chapters: [
        {
          id: "chapter_seed",
          number: 1,
          title: "古灯初燃",
          goal: "沈照夜在宗门试炼中验证归墟灯的代价，并拿到师父失踪的第一条线索。",
          conflict: "水脉宗弟子当众逼他承认火脉已废，归墟灯却在众目睽睽下失控点亮。",
          hook: "古灯映出的影子，竟然不是沈照夜本人。",
          tone: "热血压迫感",
          wordCount: 1800,
          beats: [
            "开场状态：延续上一章压力，明确本章目标。",
            "矛盾触发：对手在公开场合逼迫主角做出选择。",
            "人物行动：主角依靠现有设定主动破局。",
            "反转：看似解决的问题暴露出更深层代价。",
            "爽点：让读者看到能力、智谋或情绪关系的有效推进。",
            "结尾钩子：抛出新的危险信息。"
          ],
          content:
            "第 1 章《古灯初燃》\n\n试炼台上的火光本该与沈照夜无关。\n可当水脉宗弟子逼他当众认输时，那盏被封存多年的归墟灯忽然亮起，像是替他回答。\n\n他很清楚，灯亮一次，就要拿记忆、灵力，甚至命去换。\n但比起继续做一个被宗门踩在脚下的废人，他更需要这次机会。\n\n火焰顺着灯芯往上攀，照出了师父留下的残影，也照出了台下那些人第一次动摇的神情。\n沈照夜终于意识到，这盏灯不是在救他，而是在逼他走进一个更深的局。\n\n而影子落地的瞬间，他看到灯中倒映的人，并不是自己。",
          createdAt: now()
        }
      ],
      foreshadows: [
        {
          id: "thread_seed",
          content: "归墟灯只在沈照夜靠近师父遗物时自动点亮。",
          plantedChapter: "第 1 章",
          expectedPayoff: "第 18 章",
          related: "沈照夜、归墟灯、师父失踪",
          status: "未回收",
          warning: "",
          createdAt: now()
        }
      ],
      reports: [],
      versions: [
        {
          id: "version_seed",
          chapterId: "chapter_seed",
          title: "古灯初燃",
          tone: "热血压迫感",
          content:
            "第 1 章《古灯初燃》\n\n试炼台上的火光本该与沈照夜无关。\n可当水脉宗弟子逼他当众认输时，那盏被封存多年的归墟灯忽然亮起，像是替他回答。\n\n他很清楚，灯亮一次，就要拿记忆、灵力，甚至命去换。\n但比起继续做一个被宗门踩在脚下的废人，他更需要这次机会。\n\n火焰顺着灯芯往上攀，照出了师父留下的残影，也照出了台下那些人第一次动摇的神情。\n沈照夜终于意识到，这盏灯不是在救他，而是在逼他走进一个更深的局。\n\n而影子落地的瞬间，他看到灯中倒映的人，并不是自己。",
          source: "generated",
          style: "初稿",
          createdAt: now()
        }
      ]
    }
  ]
};

function toProject(row) {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre,
    premise: row.premise,
    targetAudience: row.target_audience,
    status: row.status,
    defaultTone: row.default_tone,
    createdAt: row.created_at,
    settings: [],
    chapters: [],
    foreshadows: [],
    reports: [],
    ioLogs: [],
    generationSessions: []
  };
}

function toSetting(row) {
  return {
    id: row.id,
    type: row.type,
    categoryNumber: row.category_number,
    name: row.name,
    summary: row.summary,
    traits: normalizeTraitTags(row.traits),
    rules: row.rules,
    createdAt: row.created_at
  };
}

function toChapter(row) {
  const hasDraft = Boolean(row.draft_saved_at);
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    goal: row.goal,
    conflict: row.conflict,
    hook: row.hook,
    tone: row.tone,
    wordCount: row.word_count,
    selectedSettingIds: row.selected_setting_ids || [],
    beats: row.beats || [],
    content: row.content,
    draftTitle: draftFallback(row.draft_title, row.title, hasDraft),
    draftTone: draftFallback(row.draft_tone, row.tone, hasDraft),
    draftContent: draftFallback(row.draft_content, row.content, hasDraft),
    draftSavedAt: row.draft_saved_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    versions: []
  };
}

function toChapterVersion(row) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    title: row.title,
    tone: row.tone,
    content: row.content,
    source: row.source,
    style: row.style,
    createdAt: row.created_at
  };
}

function toForeshadow(row) {
  return {
    id: row.id,
    content: row.content,
    plantedChapter: row.planted_chapter,
    expectedPayoff: row.expected_payoff,
    related: row.related,
    status: row.status,
    warning: row.warning,
    createdAt: row.created_at
  };
}

function toReport(row) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    score: row.score,
    findings: row.findings || [],
    createdAt: row.created_at
  };
}

function toIoLog(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    chapterId: row.chapter_id,
    workflow: row.workflow,
    stage: row.stage,
    status: row.status,
    provider: row.provider,
    model: row.model,
    inputPayload: row.input_payload || {},
    outputPayload: row.output_payload || {},
    outputText: row.output_text || "",
    createdAt: row.created_at
  };
}

function toGenerationSession(row) {
  const payload = row.payload || {};
  const workflow = payload.workflow
    ? {
        ...payload.workflow,
        sessionId: payload.workflow.sessionId || row.id,
        pendingReview: payload.workflow.pendingReview !== false
      }
    : null;
  return {
    id: row.id,
    chapterId: row.chapter_id,
    sessionType: row.session_type,
    targetMode: row.target_mode,
    status: row.status,
    input: payload.input || {},
    persist: payload.persist || {},
    workflow,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    committedAt: row.committed_at || null
  };
}

function toAiProfile(row) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    model: row.model,
    thinkingMode: row.thinking_mode || "",
    reasoningEffort: row.reasoning_effort || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function setActiveAiProfile(client, profileId) {
  await client.query(
    `INSERT INTO app_preferences (id, active_ai_profile_id, created_at, updated_at)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (id) DO UPDATE
     SET active_ai_profile_id = EXCLUDED.active_ai_profile_id,
         updated_at = EXCLUDED.updated_at`,
    [APP_PREFERENCES_ID, profileId || null, now()]
  );
}

async function readAiConfigState(db = pool) {
  const [profilesResult, preferencesResult] = await Promise.all([
    db.query("SELECT * FROM ai_profiles ORDER BY updated_at DESC, created_at DESC"),
    db.query("SELECT active_ai_profile_id FROM app_preferences WHERE id = $1", [APP_PREFERENCES_ID])
  ]);

  const profiles = profilesResult.rows.map(toAiProfile);
  let activeProfileId = preferencesResult.rows[0]?.active_ai_profile_id || "";
  let activeProfile = profiles.find((item) => item.id === activeProfileId) || null;

  if (!activeProfile && profiles.length) {
    activeProfile = profiles[0];
    activeProfileId = activeProfile.id;
  }

  return {
    profiles,
    activeProfileId,
    activeProfile
  };
}

async function resolveAiRuntimeConfig() {
  const aiConfig = await readAiConfigState();
  return aiConfig.activeProfile || buildEnvAiProfileSnapshot();
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      premise TEXT NOT NULL DEFAULT '',
      target_audience TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '筹备中',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS default_tone TEXT NOT NULL DEFAULT '热血';

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      category_number INTEGER,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      traits TEXT NOT NULL DEFAULT '',
      rules TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS category_number INTEGER;

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      conflict TEXT NOT NULL DEFAULT '',
      hook TEXT NOT NULL DEFAULT '',
      tone TEXT NOT NULL DEFAULT '热血',
      word_count INTEGER NOT NULL DEFAULT 1800,
      selected_setting_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      beats JSONB NOT NULL DEFAULT '[]'::jsonb,
      content TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE chapters
      ADD COLUMN IF NOT EXISTS draft_title TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS draft_tone TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS draft_content TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS selected_setting_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS draft_saved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    CREATE TABLE IF NOT EXISTS chapter_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      tone TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      style TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS foreshadows (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      planted_chapter TEXT NOT NULL DEFAULT '',
      expected_payoff TEXT NOT NULL DEFAULT '',
      related TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '未回收',
      warning TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      chapter_id TEXT NOT NULL DEFAULT '',
      chapter_title TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL,
      findings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS io_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      chapter_id TEXT NOT NULL DEFAULT '',
      workflow TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'success',
      provider TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      output_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ai_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local',
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      thinking_mode TEXT NOT NULL DEFAULT '',
      reasoning_effort TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE ai_profiles
      ADD COLUMN IF NOT EXISTS thinking_mode TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS reasoning_effort TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    CREATE TABLE IF NOT EXISTS app_preferences (
      id TEXT PRIMARY KEY,
      active_ai_profile_id TEXT REFERENCES ai_profiles(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS generation_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      chapter_id TEXT NOT NULL DEFAULT '',
      session_type TEXT NOT NULL DEFAULT 'generate',
      target_mode TEXT NOT NULL DEFAULT 'next',
      status TEXT NOT NULL DEFAULT 'pending',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      committed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_settings_project ON settings(project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_project_type_number
      ON settings(project_id, type, category_number);
    CREATE INDEX IF NOT EXISTS idx_chapters_project_number ON chapters(project_id, number ASC);
    CREATE INDEX IF NOT EXISTS idx_chapter_versions_chapter_created ON chapter_versions(chapter_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_foreshadows_project ON foreshadows(project_id);
    CREATE INDEX IF NOT EXISTS idx_reports_project_created ON reports(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_io_logs_project_created ON io_logs(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_profiles_updated ON ai_profiles(updated_at DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generation_sessions_project_updated
      ON generation_sessions(project_id, status, updated_at DESC, created_at DESC);
  `);

  await pool.query(`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY project_id, type ORDER BY created_at ASC, id ASC) AS next_number
      FROM settings
    )
    UPDATE settings
    SET category_number = ranked.next_number
    FROM ranked
    WHERE settings.id = ranked.id
      AND (settings.category_number IS NULL OR settings.category_number <= 0)
  `);

  await pool.query(`
    ALTER TABLE settings
      ALTER COLUMN category_number SET NOT NULL
  `);

  await pool.query(
    `INSERT INTO app_preferences (id, created_at, updated_at)
     VALUES ($1, $2, $2)
     ON CONFLICT (id) DO NOTHING`,
    [APP_PREFERENCES_ID, now()]
  );

  const envProfile = buildEnvAiProfileSnapshot();
  const aiProfilesCount = await pool.query("SELECT COUNT(*)::int AS count FROM ai_profiles");
  if (aiProfilesCount.rows[0]?.count === 0) {
    const createdAt = now();
    const profileId = id("ai_profile");
    await pool.query(
      `INSERT INTO ai_profiles (
        id, name, provider, api_key, base_url, model, thinking_mode,
        reasoning_effort, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        profileId,
        envProfile.name,
        envProfile.provider,
        envProfile.apiKey,
        envProfile.baseUrl,
        envProfile.model,
        envProfile.thinkingMode,
        envProfile.reasoningEffort,
        createdAt
      ]
    );
    await pool.query(
      `UPDATE app_preferences
       SET active_ai_profile_id = $1,
           updated_at = $2
       WHERE id = $3`,
      [profileId, createdAt, APP_PREFERENCES_ID]
    );
  } else {
    const preferencesResult = await pool.query(
      "SELECT active_ai_profile_id FROM app_preferences WHERE id = $1",
      [APP_PREFERENCES_ID]
    );
    const activeProfileId = preferencesResult.rows[0]?.active_ai_profile_id || "";
    if (activeProfileId) {
      const activeProfileResult = await pool.query("SELECT 1 FROM ai_profiles WHERE id = $1", [activeProfileId]);
      if (activeProfileResult.rowCount === 0) {
        const fallbackResult = await pool.query(
          "SELECT id FROM ai_profiles ORDER BY updated_at DESC, created_at DESC LIMIT 1"
        );
        await pool.query(
          `UPDATE app_preferences
           SET active_ai_profile_id = $1,
               updated_at = $2
           WHERE id = $3`,
          [fallbackResult.rows[0]?.id || null, now(), APP_PREFERENCES_ID]
        );
      }
    } else {
      const fallbackResult = await pool.query(
        "SELECT id FROM ai_profiles ORDER BY updated_at DESC, created_at DESC LIMIT 1"
      );
      await pool.query(
        `UPDATE app_preferences
         SET active_ai_profile_id = $1,
             updated_at = $2
         WHERE id = $3`,
        [fallbackResult.rows[0]?.id || null, now(), APP_PREFERENCES_ID]
      );
    }
  }

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM projects");
  if (rows[0].count === 0) {
    await insertSeedData();
  }
}

async function insertSeedData() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const project of seedData.projects) {
      await client.query(
        `INSERT INTO projects (
          id, title, genre, premise, target_audience, status, default_tone, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING`,
        [
          project.id,
          project.title,
          project.genre,
          project.premise,
          project.targetAudience,
          project.status,
          project.defaultTone,
          project.createdAt
        ]
      );

      const settingNumbers = new Map();
      for (const setting of project.settings) {
        const settingType = normalizeSettingType(setting.type);
        const nextSettingNumber = (settingNumbers.get(settingType) || 0) + 1;
        settingNumbers.set(settingType, nextSettingNumber);
        await client.query(
          `INSERT INTO settings (
            id, project_id, type, category_number, name, summary, traits, rules, created_at
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            setting.id,
            project.id,
            settingType,
            setting.categoryNumber || nextSettingNumber,
            setting.name,
            setting.summary,
            setting.traits,
            setting.rules,
            setting.createdAt
          ]
        );
      }

      for (const chapter of project.chapters) {
        await client.query(
          `INSERT INTO chapters (
            id, project_id, number, title, goal, conflict, hook, tone, word_count,
            selected_setting_ids, beats, content, draft_title, draft_tone, draft_content,
            draft_saved_at, updated_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18
          )
          ON CONFLICT (id) DO NOTHING`,
          [
            chapter.id,
            project.id,
            chapter.number,
            chapter.title,
            chapter.goal,
            chapter.conflict,
            chapter.hook,
            chapter.tone,
            chapter.wordCount,
            JSON.stringify(chapter.selectedSettingIds || []),
            JSON.stringify(chapter.beats),
            chapter.content,
            chapter.title,
            chapter.tone,
            chapter.content,
            chapter.createdAt,
            chapter.createdAt,
            chapter.createdAt
          ]
        );
      }

      for (const version of project.versions || []) {
        await client.query(
          `INSERT INTO chapter_versions (
            id, project_id, chapter_id, title, tone, content, source, style, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING`,
          [
            version.id,
            project.id,
            version.chapterId,
            version.title,
            version.tone,
            version.content,
            version.source,
            version.style,
            version.createdAt
          ]
        );
      }

      for (const foreshadow of project.foreshadows) {
        await client.query(
          `INSERT INTO foreshadows (
            id, project_id, content, planted_chapter, expected_payoff, related, status, warning, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING`,
          [
            foreshadow.id,
            project.id,
            foreshadow.content,
            foreshadow.plantedChapter,
            foreshadow.expectedPayoff,
            foreshadow.related,
            foreshadow.status,
            foreshadow.warning,
            foreshadow.createdAt
          ]
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function readData() {
  const [
    projectsResult,
    settingsResult,
    chaptersResult,
    versionsResult,
    foreshadowsResult,
    reportsResult,
    ioLogsResult,
    generationSessionsResult,
    aiConfigState
  ] = await Promise.all([
    pool.query("SELECT * FROM projects ORDER BY created_at DESC"),
    pool.query("SELECT * FROM settings ORDER BY project_id ASC, type ASC, category_number ASC, created_at ASC"),
    pool.query("SELECT * FROM chapters ORDER BY number ASC, created_at ASC"),
    pool.query("SELECT * FROM chapter_versions ORDER BY created_at DESC"),
    pool.query("SELECT * FROM foreshadows ORDER BY created_at DESC"),
    pool.query("SELECT * FROM reports ORDER BY created_at DESC"),
    pool.query("SELECT * FROM io_logs ORDER BY created_at DESC LIMIT 120"),
    pool.query(
      "SELECT * FROM generation_sessions WHERE status = 'pending' ORDER BY updated_at DESC, created_at DESC LIMIT 48"
    ),
    readAiConfigState()
  ]);

  const projects = projectsResult.rows.map(toProject);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const chaptersById = new Map();

  for (const row of settingsResult.rows) {
    projectsById.get(row.project_id)?.settings.push(toSetting(row));
  }

  for (const row of chaptersResult.rows) {
    const chapter = toChapter(row);
    projectsById.get(row.project_id)?.chapters.push(chapter);
    chaptersById.set(chapter.id, chapter);
  }

  for (const row of versionsResult.rows) {
    const version = toChapterVersion(row);
    chaptersById.get(version.chapterId)?.versions.push(version);
  }

  for (const row of foreshadowsResult.rows) {
    projectsById.get(row.project_id)?.foreshadows.push(toForeshadow(row));
  }

  for (const row of reportsResult.rows) {
    projectsById.get(row.project_id)?.reports.push(toReport(row));
  }

  for (const row of ioLogsResult.rows) {
    projectsById.get(row.project_id)?.ioLogs.push(toIoLog(row));
  }

  for (const row of generationSessionsResult.rows) {
    projectsById.get(row.project_id)?.generationSessions.push(toGenerationSession(row));
  }

  return {
    projects,
    aiConfig: aiConfigState
  };
}

async function readProject(projectId) {
  const data = await readData();
  return findProject(data, projectId);
}

function findProject(data, projectId) {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) {
    const error = new Error("项目不存在");
    error.statusCode = 404;
    throw error;
  }
  return project;
}

function findChapter(project, chapterId) {
  const chapter = project.chapters.find((item) => item.id === chapterId);
  if (!chapter) {
    const error = new Error("章节不存在");
    error.statusCode = 404;
    throw error;
  }
  return chapter;
}

function getChapterEditorState(chapter, project) {
  const hasDraft = Boolean(chapter.draftSavedAt);
  return {
    title: hasDraft ? chapter.draftTitle : chapter.title,
    tone: normalizeTone(hasDraft ? chapter.draftTone : chapter.tone, project.defaultTone),
    content: hasDraft ? chapter.draftContent : chapter.content
  };
}

function compactBible(project) {
  return project.settings
    .map(
      (item) =>
        `${item.name}（${item.type}）：${item.summary}${item.rules ? ` 禁忌：${item.rules}` : ""}`
    )
    .join("\n");
}

function buildSettingsSummary(project, selectedSettingIds = []) {
  return getSelectedSettings(project, selectedSettingIds)
    .map((item) => {
      const pieces = [
        `${formatSettingLabel(item)}：${item.summary}`,
        item.traits ? `标签：${item.traits}` : "",
        item.rules ? `规则：${item.rules}` : ""
      ].filter(Boolean);
      return pieces.join(" ");
    })
    .join("\n");
}

function buildBeats(input, project, chapterNumber) {
  const goal = input.goal?.trim();
  const conflict = input.conflict?.trim();
  const hook = input.hook?.trim();
  const beats = [
    chapterNumber > 1
      ? `承接状态：延续第 ${chapterNumber - 1} 章留下的局面或人物压力。`
      : `开篇任务：建立《${project.title}》第一章最值得读的场面和人物状态。`
  ];

  if (goal) beats.push(`本章任务：${goal}`);
  if (conflict) beats.push(`主要阻力：${conflict}`);
  beats.push("叙事重心：围绕当前章节真正需要的信息和情绪推进，不强行套固定结构模板。");
  beats.push(
    hook
      ? `收束方式：把读者视线带到“${hook}”这个后续牵引上。`
      : "收束方式：允许落在阶段结果、情绪变化或新的门槛上，不强制留钩子。"
  );

  return beats;
}

function buildChapterContract(project, input, chapterNumber, title) {
  const selectedSettings = getSelectedSettings(project, input.selectedSettingIds).slice(0, 4);
  const constraintLayers = buildConstraintLayers(project, input, chapterNumber, title);
  const mustMention = [
    title !== `第 ${chapterNumber} 章` ? `标题意象：${title}` : "",
    input.goal?.trim() ? `章节目标：${input.goal.trim()}` : "",
    input.conflict?.trim() ? `冲突锚点：${input.conflict.trim()}` : "",
    input.hook?.trim() ? `结尾牵引：${input.hook.trim()}` : "",
    ...constraintLayers.characterMotivations.map((item) => `人物动机锁：${item}`)
  ].filter(Boolean);
  const continuity = [...constraintLayers.continuityAnchors, ...constraintLayers.foreshadowAnchors].filter(Boolean);

  return {
    chapterLock: constraintLayers.chapterIdentity[0] || `只能写第 ${chapterNumber} 章`,
    titleLock: constraintLayers.chapterIdentity[1] || `正文首行必须是：${buildChapterHeading(chapterNumber, title)}`,
    coreMission: input.goal?.trim() || `推进《${project.title}》当前叙事`,
    conflictAnchor: input.conflict?.trim() || "允许以信息推进、关系位移或情绪积累完成本章",
    endingRequirement: input.hook?.trim()
      ? `结尾必须把视线收在“${input.hook.trim()}”这个牵引上`
      : "允许自然收束，不强制反转或钩子",
    mustUseSettings: selectedSettings.map((item) =>
      [
        formatSettingLabel(item),
        item.summary,
        item.rules ? `规则：${item.rules}` : ""
      ]
        .filter(Boolean)
        .join("｜")
    ),
    mustMention,
    continuity,
    forbidden: constraintLayers.hardBans,
    constraintLayers
  };
}

function buildFallbackChapterPlan(project, input, chapterNumber, title, contract) {
  const hook = input.hook?.trim();
  return {
    narrativeMode: input.conflict?.trim() ? "推进" : "铺垫",
    summary: input.goal?.trim() || `推进《${project.title}》当前叙事`,
    beats: buildBeats(input, project, chapterNumber),
    mustKeep: toStringArray([
      title !== `第 ${chapterNumber} 章` ? `标题意象：${title}` : "",
      input.goal?.trim(),
      input.conflict?.trim()
    ]),
    mustMention: toStringArray(contract?.mustMention),
    mustUseSettings: toStringArray(contract?.mustUseSettings),
    continuity: toStringArray(contract?.continuity, 8),
    forbidden: toStringArray(contract?.forbidden),
    endingMode: hook ? "hook" : "natural",
    endingNote: hook || "允许自然收束，不必强留悬念。"
  };
}

function parseChapterPlan(text, fallbackPlan) {
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallbackPlan;
  }

  const endingMode = ["natural", "open", "hook"].includes(parsed.endingMode)
    ? parsed.endingMode
    : fallbackPlan.endingMode;
  const beats = toStringArray(parsed.beats);
  const mustKeep = toStringArray(parsed.mustKeep);
  const mustMention = toStringArray(parsed.mustMention);
  const mustUseSettings = toStringArray(parsed.mustUseSettings);
  const continuity = toStringArray(parsed.continuity, 8);
  const forbidden = toStringArray(parsed.forbidden);

  return {
    narrativeMode: String(parsed.narrativeMode || fallbackPlan.narrativeMode).trim() || fallbackPlan.narrativeMode,
    summary: String(parsed.summary || fallbackPlan.summary).trim() || fallbackPlan.summary,
    beats: beats.length ? beats : fallbackPlan.beats,
    mustKeep: mustKeep.length ? mustKeep : fallbackPlan.mustKeep,
    mustMention: mustMention.length ? mustMention : fallbackPlan.mustMention,
    mustUseSettings: mustUseSettings.length ? mustUseSettings : fallbackPlan.mustUseSettings,
    continuity: continuity.length ? continuity : fallbackPlan.continuity,
    forbidden: forbidden.length ? forbidden : fallbackPlan.forbidden,
    endingMode,
    endingNote: String(parsed.endingNote || fallbackPlan.endingNote).trim() || fallbackPlan.endingNote
  };
}

function normalizeWorkflowText(value, fallback = "") {
  const next = String(value ?? "").trim();
  return next || fallback;
}

function normalizeWorkflowList(value, fallback = [], limit = 8) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n|[；;]+/)
        .map((item) => item.trim());
  const seen = new Set();
  const normalized = items
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item))
    .slice(0, limit);

  return normalized.length ? normalized : fallback;
}

function normalizeWorkflowTextOverride(value, fallback = "") {
  if (value === undefined) return fallback;
  return String(value ?? "").trim();
}

function normalizeWorkflowListOverride(value, fallback = [], limit = 8) {
  if (value === undefined) return fallback;
  return normalizeWorkflowList(value, [], limit);
}

function mergeWorkflowContract(baseContract, patch = {}) {
  return {
    ...baseContract,
    ...patch,
    mustUseSettings: mergeWorkflowLists(baseContract.mustUseSettings || [], patch.mustUseSettings || []),
    mustMention: mergeWorkflowLists(baseContract.mustMention || [], patch.mustMention || []),
    continuity: mergeWorkflowLists(baseContract.continuity || [], patch.continuity || []),
    forbidden: mergeWorkflowLists(baseContract.forbidden || [], patch.forbidden || [])
  };
}

function mergeWorkflowPlan(basePlan, patch = {}) {
  return {
    ...basePlan,
    ...patch,
    beats: mergeWorkflowLists(basePlan.beats || [], patch.beats || []),
    mustKeep: mergeWorkflowLists(basePlan.mustKeep || [], patch.mustKeep || []),
    mustMention: mergeWorkflowLists(basePlan.mustMention || [], patch.mustMention || []),
    mustUseSettings: mergeWorkflowLists(basePlan.mustUseSettings || [], patch.mustUseSettings || []),
    continuity: mergeWorkflowLists(basePlan.continuity || [], patch.continuity || []),
    forbidden: mergeWorkflowLists(basePlan.forbidden || [], patch.forbidden || [])
  };
}

function normalizeGuardContractPatch(patch = {}, fallback = {}) {
  return {
    coreMission: normalizeWorkflowTextOverride(patch?.coreMission, fallback.coreMission),
    conflictAnchor: normalizeWorkflowTextOverride(patch?.conflictAnchor, fallback.conflictAnchor),
    endingRequirement: normalizeWorkflowTextOverride(
      patch?.endingRequirement,
      fallback.endingRequirement
    ),
    mustUseSettings: normalizeWorkflowListOverride(
      patch?.mustUseSettings,
      fallback.mustUseSettings || [],
      8
    ),
    mustMention: normalizeWorkflowListOverride(patch?.mustMention, fallback.mustMention || [], 8),
    continuity: normalizeWorkflowListOverride(patch?.continuity, fallback.continuity || [], 10),
    forbidden: normalizeWorkflowListOverride(patch?.forbidden, fallback.forbidden || [], 10)
  };
}

function normalizeGuardPlanPatch(patch = {}, fallback = {}) {
  return {
    endingMode: normalizeWorkflowTextOverride(patch?.endingMode, fallback.endingMode),
    narrativeMode: normalizeWorkflowTextOverride(patch?.narrativeMode, fallback.narrativeMode),
    summary: normalizeWorkflowTextOverride(patch?.summary, fallback.summary),
    beats: normalizeWorkflowListOverride(patch?.beats, fallback.beats || [], 8),
    mustKeep: normalizeWorkflowListOverride(patch?.mustKeep, fallback.mustKeep || [], 8),
    endingNote: normalizeWorkflowTextOverride(patch?.endingNote, fallback.endingNote)
  };
}

function mergeGuardContractPatches(...patches) {
  return patches.filter(Boolean).reduce((current, patch) => mergeWorkflowContract(current, patch), {});
}

function mergeGuardPlanPatches(...patches) {
  return patches.filter(Boolean).reduce((current, patch) => mergeWorkflowPlan(current, patch), {});
}

function mergeWorkflowLists(...lists) {
  const seen = new Set();
  return lists
    .flat()
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

function normalizeChapterContractDraft(baseContract, draft = {}) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return baseContract;
  }

  return {
    ...baseContract,
    chapterLock: normalizeWorkflowTextOverride(draft.chapterLock, baseContract.chapterLock),
    titleLock: normalizeWorkflowTextOverride(draft.titleLock, baseContract.titleLock),
    coreMission: normalizeWorkflowTextOverride(draft.coreMission, baseContract.coreMission),
    conflictAnchor: normalizeWorkflowTextOverride(draft.conflictAnchor, baseContract.conflictAnchor),
    endingRequirement: normalizeWorkflowTextOverride(draft.endingRequirement, baseContract.endingRequirement),
    mustUseSettings: normalizeWorkflowListOverride(draft.mustUseSettings, baseContract.mustUseSettings, 8),
    mustMention: normalizeWorkflowListOverride(draft.mustMention, baseContract.mustMention, 8),
    continuity: normalizeWorkflowListOverride(draft.continuity, baseContract.continuity, 10),
    forbidden: normalizeWorkflowListOverride(draft.forbidden, baseContract.forbidden, 10),
    constraintLayers: hydrateConstraintLayers(draft.constraintLayers, baseContract.constraintLayers)
  };
}

function normalizeChapterPlanDraft(basePlan, draft = {}) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return basePlan;
  }

  const endingMode = ["natural", "open", "hook"].includes(draft.endingMode)
    ? draft.endingMode
    : basePlan.endingMode;

  return {
    ...basePlan,
    narrativeMode: normalizeWorkflowTextOverride(draft.narrativeMode, basePlan.narrativeMode),
    summary: normalizeWorkflowTextOverride(draft.summary, basePlan.summary),
    beats: normalizeWorkflowListOverride(draft.beats, basePlan.beats, 8),
    mustKeep: normalizeWorkflowListOverride(draft.mustKeep, basePlan.mustKeep, 8),
    mustMention: normalizeWorkflowListOverride(draft.mustMention, basePlan.mustMention, 8),
    mustUseSettings: normalizeWorkflowListOverride(draft.mustUseSettings, basePlan.mustUseSettings, 8),
    continuity: normalizeWorkflowListOverride(draft.continuity, basePlan.continuity, 10),
    forbidden: normalizeWorkflowListOverride(draft.forbidden, basePlan.forbidden, 10),
    endingMode,
    endingNote: normalizeWorkflowTextOverride(draft.endingNote, basePlan.endingNote)
  };
}

function summarizeWorkflowHint(value) {
  const text = String(value || "").trim();
  if (!text) return [];

  const source = text.includes("：") ? text.split("：").slice(-1)[0] : text;
  return source
    .split(/[｜、，,；;。\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 5);
}

function contentMatchesHint(content, hint) {
  const normalized = String(content || "");
  if (!normalized.trim()) return false;

  const keywords = summarizeWorkflowHint(hint);
  if (!keywords.length) return normalized.includes(String(hint || "").trim());
  return keywords.some((keyword) => normalized.includes(keyword));
}

function buildFallbackGuardReport({
  project,
  input,
  contract,
  plan,
  content = "",
  phase = "postwrite",
  headingLine
}) {
  const findings = [];
  const suggestedContractPatch = {
    mustMention: [],
    continuity: [],
    forbidden: []
  };
  const suggestedPlanPatch = {
    beats: [],
    mustKeep: [],
    endingNote: ""
  };
  const repairPlan = [];
  const selectedSettings = getSelectedSettings(project, input.selectedSettingIds).slice(0, 3);
  const unresolvedThreads = project.foreshadows.filter((item) => item.status !== "已回收").slice(0, 2);
  const normalizedContent = String(content || "").trim();
  const constraintLayers = contract?.constraintLayers || {};
  const constraintPolicy = constraintLayers.policy || normalizeConstraintPolicy(input.constraintPolicy);
  const addFinding = (finding) => {
    findings.push({
      id: finding.id || `${phase}-${finding.target || "content"}-${findings.length + 1}`,
      contractPatch: normalizeGuardContractPatch(finding.contractPatch, {}),
      planPatch: normalizeGuardPlanPatch(finding.planPatch, {}),
      ...finding
    });
  };

  if (phase === "preflight") {
    if (
      constraintPolicy.lockCharacterMotivations &&
      constraintLayers.characterMotivations?.length &&
      !contract.mustMention.some((line) => line.includes("人物动机锁"))
    ) {
      addFinding({
        severity: "medium",
        type: "motivation_drift",
        target: "contract",
        title: "人物动机锁未显式带入",
        detail: "你开启了“锁人物动机”，但当前 contract 里还没有把核心角色的动机约束显式带进来。",
        suggestion: "把需要锁定的角色动机写入 mustMention，避免 writer 在推进时把人物写飘。"
      });
      suggestedContractPatch.mustMention.push(
        ...constraintLayers.characterMotivations.map((item) => `人物动机锁：${item}`)
      );
    }

    if (input.hook?.trim() && plan.endingMode !== "hook") {
      addFinding({
        severity: "medium",
        type: "ending",
        target: "plan",
        title: "结尾牵引偏弱",
        detail: "用户明确提供了结尾钩子，但 brief 没有锁定为 hook 收束。",
        suggestion: "把 endingMode 调成 hook，并在 endingNote 里明确这个钩子要落地。"
      });
      suggestedPlanPatch.endingNote = input.hook.trim();
    }

    if (unresolvedThreads.length) {
      const missingThreads = unresolvedThreads.filter(
        (item) =>
          !contract.continuity.some((line) => line.includes(item.content)) &&
          !plan.continuity.some((line) => line.includes(item.content))
      );

      if (missingThreads.length) {
        addFinding({
          severity: "medium",
          type: "foreshadow_miss",
          target: "contract",
          title: "伏笔照应不足",
          detail: "当前仍有未回收伏笔，但约束链里没有明确提醒本章是否需要照应。",
          suggestion: "把最关键的未回收伏笔加进 continuity，避免章节推进时彻底遗忘。"
        });
        suggestedContractPatch.continuity.push(
          ...missingThreads.map((item) => `待照应伏笔｜${item.plantedChapter || "未标章节"}｜${item.content}`)
        );
      }
    }

    if (
      constraintPolicy.lockRecentContinuity &&
      constraintLayers.continuityAnchors?.length &&
      !constraintLayers.continuityAnchors.every((item) =>
        [...contract.continuity, ...(plan.continuity || [])].some((line) => line.includes(item.slice(0, 10)))
      )
    ) {
      addFinding({
        severity: "medium",
        type: "continuity",
        target: "contract",
        title: "最近章节承接不够明确",
        detail: "你开启了“锁最近连续性”，但 contract / plan 还没有把最近两章的承接提醒锁到位。",
        suggestion: "把最近章节的目标、冲突或结尾结果补进 continuity，避免生成时跳轴。"
      });
      suggestedContractPatch.continuity.push(...constraintLayers.continuityAnchors);
    }

    if (
      constraintPolicy.strictWorldRules &&
      constraintLayers.worldRules?.length &&
      !constraintLayers.worldRules.every((item) =>
        contract.forbidden.some((line) => line.includes(item.slice(0, 10)))
      )
    ) {
      addFinding({
        severity: "medium",
        type: "setting_conflict",
        target: "contract",
        title: "世界/能力规则锁定不足",
        detail: "你开启了“锁世界规则”，但当前 forbidden 还没有把关键规则限制写清楚。",
        suggestion: "把容易被越界的世界或能力规则补进 forbidden，降低后续设定冲突。"
      });
      suggestedContractPatch.forbidden.push(
        ...constraintLayers.worldRules.map((item) => `不能违反规则：${item}`)
      );
    }

    if (input.goal?.trim() && !contentMatchesHint(plan.summary, input.goal.trim())) {
      addFinding({
        severity: "medium",
        type: "motivation_drift",
        target: "plan",
        title: "章节任务可能漂移",
        detail: "brief 的 summary 与用户目标没有明显同轴，正文容易写偏。",
        suggestion: "让 plan.summary 直接复述本章核心任务，必要时把用户目标写进 mustKeep。"
      });
      suggestedPlanPatch.mustKeep.push(`章节目标：${input.goal.trim()}`);
    }

    if (!plan.beats?.length || plan.beats.length < 3) {
      addFinding({
        severity: "high",
        type: "continuity",
        target: "plan",
        title: "节拍不足",
        detail: "brief 的节拍过少，writer 容易自由发挥并冲掉约束。",
        suggestion: "补齐 3 到 6 条可执行节拍，至少覆盖承接、推进和收束。"
      });
      suggestedPlanPatch.beats.push("承接上章状态并落到当前场景。", "围绕本章核心任务推进一次有效行动。", "按既定收束方式结束本章。");
    }
  } else {
    const firstLine = normalizedContent.split(/\r?\n/).find((line) => line.trim()) || "";
    if (firstLine !== headingLine) {
      addFinding({
        severity: "high",
        type: "chapter_drift",
        target: "content",
        title: "章节首行漂移",
        detail: "正文首行没有严格遵守章节号/标题要求。",
        suggestion: "只修正首行，不改其他段落结构。"
      });
      repairPlan.push(`把正文首行改成：${headingLine}`);
    }

    for (const setting of selectedSettings) {
      if (!contentMatchesHint(normalizedContent, setting.name)) {
        addFinding({
          severity: "medium",
          type: "setting_conflict",
          target: "content",
          title: `设定调用偏弱：${setting.name}`,
          detail: "本章选择带入了该设定，但正文没有明显照应，容易造成约束形同虚设。",
          suggestion: "只补一个能自然落地的提及或动作，不要整段重写。"
        });
        repairPlan.push(`补一处对“${setting.name}”的自然照应，保持剧情事实不变。`);
      }
    }

    if (input.hook?.trim() && !contentMatchesHint(normalizedContent, input.hook.trim())) {
      addFinding({
        severity: "medium",
        type: "ending",
        target: "content",
        title: "结尾钩子未落地",
        detail: "用户要求的结尾牵引在正文中不明显，连载追读力不足。",
        suggestion: "只改最后一段或最后两段，把视线收在该钩子上。"
      });
      repairPlan.push(`调整结尾两段，让“${input.hook.trim()}”成为最终牵引。`);
    }

    const characterSettings = selectedSettings.filter((item) => item.type === "character");
    if (characterSettings.length && !characterSettings.some((item) => contentMatchesHint(normalizedContent, item.name))) {
      addFinding({
        severity: "high",
        type: "motivation_drift",
        target: "content",
        title: "人物动机锚点不足",
        detail: "本章带入的核心角色没有进入正文焦点，人物线可能与章节任务脱节。",
        suggestion: "补一处体现角色选择、代价或判断的句子，保持最小修改。"
      });
      repairPlan.push("补一处角色作出判断或承受代价的细节，让人物动机重新落地。");
    }

    if (unresolvedThreads.length) {
      const missedThreads = unresolvedThreads.filter((item) =>
        contract.continuity.some((line) => line.includes(item.content)) && !contentMatchesHint(normalizedContent, item.content)
      );

      if (missedThreads.length) {
        addFinding({
          severity: "medium",
          type: "foreshadow_miss",
          target: "content",
          title: "伏笔漏接",
          detail: "contract 明确要求照应的伏笔，没有在正文中得到可见承接。",
          suggestion: "加一处轻量照应即可，不要提前过度回收。"
        });
        repairPlan.push(`轻量照应伏笔：${missedThreads[0].content}`);
      }
    }

    if (normalizedContent.length < Math.max(600, Number(input.wordCount || 1800) * 0.45)) {
      addFinding({
        severity: "low",
        type: "continuity",
        target: "content",
        title: "正文偏短",
        detail: "正文长度明显低于目标字数，部分约束可能没有展开到位。",
        suggestion: "优先补足既有场景里的动作、代价或承接，不要新开支线。"
      });
    }
  }

  const patchedContract = {
    ...suggestedContractPatch,
    mustMention: mergeWorkflowLists(suggestedContractPatch.mustMention),
    continuity: mergeWorkflowLists(suggestedContractPatch.continuity),
    forbidden: mergeWorkflowLists(suggestedContractPatch.forbidden)
  };
  const patchedPlan = {
    ...suggestedPlanPatch,
    beats: mergeWorkflowLists(suggestedPlanPatch.beats),
    mustKeep: mergeWorkflowLists(suggestedPlanPatch.mustKeep)
  };
  const penalty = findings.reduce(
    (total, item) => total + (item.severity === "high" ? 22 : item.severity === "medium" ? 10 : 4),
    0
  );
  const status = findings.some((item) => item.severity === "high")
    ? "needs_fix"
    : findings.length
      ? "needs_fix"
      : "pass";

  return {
    phase,
    status,
    score: Math.max(40, 98 - penalty),
    findings,
    suggestedContractPatch: patchedContract,
    suggestedPlanPatch: patchedPlan,
    repairPlan
  };
}

function parseGuardReport(text, fallbackReport) {
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallbackReport;
  }

  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
        .map((item) => ({
          severity: ["high", "medium", "low"].includes(item?.severity) ? item.severity : "medium",
          type: normalizeWorkflowText(item?.type, "continuity"),
          target: ["contract", "plan", "content"].includes(item?.target) ? item.target : "content",
          title: normalizeWorkflowText(item?.title, "未命名问题"),
          detail: normalizeWorkflowText(item?.detail, "未提供细节"),
          suggestion: normalizeWorkflowText(item?.suggestion, "按最小改动原则修正。")
        }))
        .filter((item) => item.title)
    : fallbackReport.findings;
  const parsedStatus = ["pass", "needs_fix", "block"].includes(parsed.status)
    ? parsed.status
    : fallbackReport.status;
  const score = Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : fallbackReport.score;
  const derivedStatus =
    parsedStatus === "pass" && findings.length
      ? "needs_fix"
      : parsedStatus;

  return {
    ...fallbackReport,
    status: derivedStatus,
    score,
    findings: findings.length ? findings : fallbackReport.findings,
    suggestedContractPatch: {
      mustMention: normalizeWorkflowList(parsed.suggestedContractPatch?.mustMention, fallbackReport.suggestedContractPatch.mustMention, 8),
      continuity: normalizeWorkflowList(parsed.suggestedContractPatch?.continuity, fallbackReport.suggestedContractPatch.continuity, 10),
      forbidden: normalizeWorkflowList(parsed.suggestedContractPatch?.forbidden, fallbackReport.suggestedContractPatch.forbidden, 10)
    },
    suggestedPlanPatch: {
      beats: normalizeWorkflowList(parsed.suggestedPlanPatch?.beats, fallbackReport.suggestedPlanPatch.beats, 8),
      mustKeep: normalizeWorkflowList(parsed.suggestedPlanPatch?.mustKeep, fallbackReport.suggestedPlanPatch.mustKeep, 8),
      endingNote: normalizeWorkflowText(parsed.suggestedPlanPatch?.endingNote, fallbackReport.suggestedPlanPatch.endingNote)
    },
    repairPlan: normalizeWorkflowList(parsed.repairPlan, fallbackReport.repairPlan, 6)
  };
}

function localChapter(project, input, plan, contract) {
  const chapterNumber = input.chapterNumber;
  const title = input.title;
  const tone = normalizeTone(input.tone, project.defaultTone);
  const bible = getSelectedSettings(project, input.selectedSettingIds)
    .slice(0, 5)
    .map((item) => item.name)
    .join("、") || "既有设定";
  const goal = input.goal?.trim() || plan.summary || "推进当前叙事";
  const conflict = input.conflict?.trim();
  const endingText = input.hook?.trim()
    ? `结尾把视线收在“${input.hook.trim()}”这个牵引上，为下一章留出继续推进的空间。`
    : "结尾可以自然落在阶段结果、情绪变化或新的场景门槛上，不必硬造反转和钩子。";

  return [
    buildChapterHeading(chapterNumber, title),
    "",
    `本章基调：${tone}。`,
    "",
    `这一章围绕《${project.title}》当前最需要推进的部分展开：${goal}。场景依托${bible}这些既有设定推进，重点不是把模板补齐，而是让人物在当下处境里做出有效行动。`,
    "",
    conflict
      ? `本章的主要阻力是：${conflict}。它会挤压人物选择，迫使角色在关系、代价和信息之间重新判断。`
      : "这一章不一定靠强冲突取胜，也可以通过信息揭示、关系位移或情绪积累完成推进。",
    "",
    contract?.mustUseSettings?.length
      ? `必须直接调用这些设定：${contract.mustUseSettings.join("；")}。`
      : "优先直接调用已经入库的设定，而不是临时发明新规则。",
    "",
    contract?.continuity?.length
      ? `连续性约束：${contract.continuity.join("；")}。`
      : "保持与已有章节连续，不自创会破坏主线的事实。",
    "",
    `写作时优先执行这些节拍：${plan.beats.join("；")}。`,
    "",
    endingText
  ].join("\n");
}

function buildNormalizedChapterInput(project, input) {
  const chapterNumber = input.chapterNumber || computeNextChapterNumber(project);
  const title = sanitizeChapterTitle(input.title, chapterNumber);

  return {
    ...input,
    chapterNumber,
    title,
    tone: normalizeTone(input.tone, project.defaultTone),
    wordCount: Number(input.wordCount || 1800),
    selectedSettingIds: normalizeSelectedSettingIds(input.selectedSettingIds, project),
    constraintPolicy: normalizeConstraintPolicy(input.constraintPolicy)
  };
}

async function runChapterGuardStage({
  project,
  input,
  contract,
  plan,
  content = "",
  phase = "postwrite",
  workflow = "chapter_generate",
  stage = phase === "preflight" ? "guard_preflight" : "guard",
  aiConfig
}) {
  const headingLine = buildChapterHeading(input.chapterNumber, input.title);
  const fallbackReport = buildFallbackGuardReport({
    project,
    input,
    contract,
    plan,
    content,
    phase,
    headingLine
  });
  const runtimeConfig = aiConfig || (await resolveAiRuntimeConfig());

  if (isRemoteAiProvider(runtimeConfig.provider)) {
    const raw = await runAiStage({
      projectId: project.id,
      chapterId: input.chapterId || "",
      workflow,
      stage,
      messages: buildChapterGuardMessages({
        project,
        settingsSummary: buildSettingsSummary(project, input.selectedSettingIds),
        chapterNumber: input.chapterNumber,
        title: input.title,
        input,
        contract,
        plan,
        content,
        phase,
        headingLine
      }),
      temperature: 0.2,
      aiConfig: runtimeConfig
    });
    return parseGuardReport(raw, fallbackReport);
  }

  await recordIoLog({
    projectId: project.id,
    chapterId: input.chapterId || "",
    workflow,
    stage,
    inputPayload: {
      phase,
      input,
      contract,
      plan,
      headingLine
    },
    outputPayload: fallbackReport
  });

  return fallbackReport;
}

function repairChapterLocally({ project, content, input, contract, guardReport }) {
  const headingLine = buildChapterHeading(input.chapterNumber, input.title);
  let nextContent = String(content || "").trim();
  if (!nextContent) return headingLine;

  const lines = nextContent.replace(/\r\n/g, "\n").split("\n");
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim());
  if (firstNonEmptyIndex === -1) {
    nextContent = headingLine;
  } else if (/^第\s*[零〇一二三四五六七八九十百千万两\d]+\s*章/.test(lines[firstNonEmptyIndex].trim())) {
    lines[firstNonEmptyIndex] = headingLine;
    nextContent = lines.join("\n").trim();
  } else if (lines[firstNonEmptyIndex].trim() !== headingLine) {
    nextContent = [headingLine, "", nextContent].join("\n");
  }

  if (input.hook?.trim() && !contentMatchesHint(nextContent, input.hook.trim())) {
    nextContent = `${nextContent}\n\n直到这一刻，他才意识到，真正把人拖向下一章的，正是“${input.hook.trim()}”。`;
  }

  const missingSetting = getSelectedSettings(project, input.selectedSettingIds)
    .slice(0, 2)
    .find((item) => !contentMatchesHint(nextContent, item.name));
  if (missingSetting) {
    nextContent = `${nextContent}\n\n${missingSetting.name}在他心里掠过一下，像提醒，也像新的门槛。`;
  }

  if (
    guardReport.findings.some((item) => item.type === "motivation_drift") &&
    !/代价|选择|判断/.test(nextContent)
  ) {
    nextContent = `${nextContent}\n\n他知道这一步不是白拿的，每个判断都会在后面要回代价。`;
  }

  if (
    guardReport.findings.some(
      (item) => item.target === "content" && item.type === "continuity"
    ) &&
    !/上章|上一章|旧案|证词|矛盾/.test(nextContent)
  ) {
    nextContent = `${nextContent}\n\n上章留下来的那道矛盾还卡在他心口，让他每一步都比任何时候更谨慎。`;
  }

  if (
    guardReport.findings.some(
      (item) => item.target === "content" && item.type === "setting_conflict"
    ) &&
    !/规则.*缝隙|规则.*边界|没有真正打破规则/.test(nextContent)
  ) {
    nextContent = `${nextContent}\n\n他并没有真正打破规则，只是踩着规则允许的边界，硬生生撬开了一道缝。`;
  }

  return nextContent.trim();
}

async function runChapterRepairStage({
  project,
  input,
  contract,
  plan,
  content,
  guardReport,
  workflow = "chapter_generate",
  stage = "repair",
  aiConfig
}) {
  const runtimeConfig = aiConfig || (await resolveAiRuntimeConfig());
  const localFallback = repairChapterLocally({ content, input, contract, guardReport, project });
  const normalizedSource = normalizeGeneratedChapterContent(content, input.chapterNumber, input.title);

  if (isRemoteAiProvider(runtimeConfig.provider)) {
    const repaired = await runAiStage({
      projectId: project.id,
      chapterId: input.chapterId || "",
      workflow,
      stage,
      messages: buildChapterRepairMessages({
        project,
        settingsSummary: buildSettingsSummary(project, input.selectedSettingIds),
        chapterNumber: input.chapterNumber,
        title: input.title,
        input,
        contract,
        plan,
        guardReport,
        content,
        headingLine: buildChapterHeading(input.chapterNumber, input.title)
      }),
      temperature: 0.3,
      aiConfig: runtimeConfig
    });
    const normalizedRemote = normalizeGeneratedChapterContent(repaired, input.chapterNumber, input.title);
    return normalizedRemote && normalizedRemote !== normalizedSource ? repaired : localFallback;
  }

  await recordIoLog({
    projectId: project.id,
    chapterId: input.chapterId || "",
    workflow,
    stage,
    inputPayload: {
      input,
      contract,
      plan,
      guardReport
    },
    outputText: localFallback
  });
  return localFallback;
}

function buildWorkflowPreviewPayload({
  chapterId = "",
  chapterNumber,
  title,
  input,
  contract = null,
  plan = null,
  preflightGuard = null
}) {
  return {
    chapterId,
    chapterNumber,
    title,
    input,
    contract,
    plan,
    preflightGuard
  };
}

async function prepareChapterWorkflow(project, input, options = {}) {
  const runtime = options.runtime || null;
  const workflow = options.workflow || "chapter_generate";
  const normalizedInput = buildNormalizedChapterInput(project, input);
  const chapterNumber = normalizedInput.chapterNumber;
  const title = normalizedInput.title;
  const previewChapterId = input.chapterId || "";

  runtime?.stage("contract", "running", {
    message: "正在整理本章目标、设定与约束层。"
  });

  const baseContract = buildChapterContract(project, normalizedInput, chapterNumber, title);
  let contract = normalizeChapterContractDraft(baseContract, input.workflowDraft?.contract);
  runtime?.stage("contract", "done", {
    message: `已锁定第 ${chapterNumber} 章 contract。`,
    meta: {
      chapterNumber,
      title,
      continuityCount: normalizeWorkflowList(contract.continuity, [], 6).length,
      forbiddenCount: normalizeWorkflowList(contract.forbidden, [], 6).length
    }
  });
  runtime?.snapshot({
    workflowPreview: buildWorkflowPreviewPayload({
      chapterId: previewChapterId,
      chapterNumber,
      title,
      input: normalizedInput,
      contract
    })
  });

  const fallbackPlan = buildFallbackChapterPlan(project, normalizedInput, chapterNumber, title, contract);
  const aiConfig = options.aiConfig || (await resolveAiRuntimeConfig());

  let plan = normalizeChapterPlanDraft(fallbackPlan, input.workflowDraft?.plan);
  const shouldRunPlanner =
    !input.workflowDraft?.plan || !Array.isArray(input.workflowDraft?.plan?.beats) || !input.workflowDraft.plan.beats.length;

  runtime?.stage("planner", "running", {
    message: shouldRunPlanner ? "正在拆解 beats 与章节推进顺序。" : "正在对齐你手工调整过的 plan。"
  });

  if (shouldRunPlanner && isRemoteAiProvider(aiConfig.provider)) {
    const settingsSummary = buildSettingsSummary(project, normalizedInput.selectedSettingIds);
    const plannerMessages = buildChapterPlannerMessages({
      project,
      settingsSummary,
      chapterNumber,
      title,
      input: normalizedInput,
      contract
    });
    const rawPlan = await runAiStage({
      projectId: project.id,
      chapterId: input.chapterId,
      workflow,
      stage: options.plannerStage || "planner",
      messages: plannerMessages,
      temperature: 0.35,
      aiConfig
    });
    plan = parseChapterPlan(rawPlan, fallbackPlan);
  }

  if (input.workflowDraft?.plan) {
    plan = normalizeChapterPlanDraft(plan, input.workflowDraft.plan);
  }

  runtime?.stage("planner", "done", {
    message: `Planner 已完成，生成 ${normalizeWorkflowList(plan.beats, [], 12).length} 条节拍。`,
    meta: {
      beatsCount: normalizeWorkflowList(plan.beats, [], 12).length,
      narrativeMode: plan.narrativeMode || "mixed"
    }
  });
  runtime?.snapshot({
    workflowPreview: buildWorkflowPreviewPayload({
      chapterId: previewChapterId,
      chapterNumber,
      title,
      input: normalizedInput,
      contract,
      plan
    })
  });

  runtime?.stage("guard_preflight", "running", {
    message: "正在检查设定冲突、人物动机与伏笔承接。"
  });
  const preflightGuard = await runChapterGuardStage({
    project,
    input: normalizedInput,
    contract,
    plan,
    phase: "preflight",
    workflow,
    stage: options.guardStage || "guard_preflight",
    aiConfig
  });

  if (!input.workflowDraft) {
    contract = mergeWorkflowContract(contract, preflightGuard.suggestedContractPatch || {});
    plan = mergeWorkflowPlan(plan, preflightGuard.suggestedPlanPatch || {});
  }

  contract = {
    ...contract,
    constraintLayers: hydrateConstraintLayers(contract.constraintLayers, baseContract.constraintLayers)
  };

  runtime?.stage("guard_preflight", "done", {
    message: `Preflight Guard ${preflightGuard.score ?? "--"} / ${preflightGuard.status || "pass"}`,
    meta: {
      score: preflightGuard.score ?? null,
      status: preflightGuard.status || "pass",
      findingsCount: Array.isArray(preflightGuard.findings) ? preflightGuard.findings.length : 0
    }
  });
  runtime?.snapshot({
    workflowPreview: buildWorkflowPreviewPayload({
      chapterId: previewChapterId,
      chapterNumber,
      title,
      input: normalizedInput,
      contract,
      plan,
      preflightGuard
    })
  });

  return {
    input: normalizedInput,
    chapterNumber,
    title,
    contract,
    plan,
    preflightGuard,
    aiConfig
  };
}

async function recordIoLog(entry) {
  if (!entry?.projectId) return;

  try {
    const runtimeConfig =
      entry.provider && entry.model ? null : await resolveAiRuntimeConfig().catch(() => null);
    const provider = entry.provider || runtimeConfig?.provider || "local";
    const model =
      entry.model || runtimeConfig?.model || (isRemoteAiProvider(provider) ? "remote" : "local-fallback");
    await pool.query(
      `INSERT INTO io_logs (
        id, project_id, chapter_id, workflow, stage, status, provider, model,
        input_payload, output_payload, output_text, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::jsonb, $10::jsonb, $11, $12
      )`,
      [
        id("io"),
        entry.projectId,
        entry.chapterId || "",
        entry.workflow || "",
        entry.stage || "",
        entry.status || "success",
        provider,
        model,
        JSON.stringify(entry.inputPayload || {}),
        JSON.stringify(entry.outputPayload || {}),
        entry.outputText || "",
        now()
      ]
    );
  } catch (error) {
    console.error("Failed to write io log.");
    console.error(error.message);
  }
}

function buildAiRequestPayload(messages, aiConfig, options = {}) {
  const thinkingMode = normalizeAiThinkingMode(aiConfig?.thinkingMode, "");
  const reasoningEffort = normalizeAiReasoningEffort(aiConfig?.reasoningEffort, "");
  const payload = {
    model: aiConfig?.model || "",
    messages,
    temperature: options.temperature ?? 0.75
  };

  if (thinkingMode) {
    payload.thinking = { type: thinkingMode };
  }

  if (reasoningEffort && thinkingMode !== "disabled") {
    payload.reasoning_effort = reasoningEffort;
  }

  if (options.stream) {
    payload.stream = true;
  }

  return payload;
}

function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return item?.text || item?.content || "";
      })
      .join("");
  }
  if (content && typeof content === "object") {
    return content.text || "";
  }
  return "";
}

async function callOpenAICompatible(messages, aiConfig, options = {}) {
  const runtimeConfig = aiConfig || (await resolveAiRuntimeConfig());
  const apiKey = runtimeConfig.apiKey;
  const model = runtimeConfig.model;

  if (!apiKey || !model) {
    throw new Error("使用 AI 兼容接口需要配置 API Key 和模型");
  }

  const baseUrl = buildDefaultBaseUrl(runtimeConfig.provider, runtimeConfig.baseUrl, model);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildAiRequestPayload(messages, runtimeConfig, options))
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || raw || "AI 服务请求失败");
  }

  if (!payload) {
    return raw || "";
  }

  return extractTextContent(payload.choices?.[0]?.message?.content);
}

async function* streamOpenAICompatible(messages, aiConfig, options = {}) {
  const runtimeConfig = aiConfig || (await resolveAiRuntimeConfig());
  const apiKey = runtimeConfig.apiKey;
  const model = runtimeConfig.model;

  if (!apiKey || !model) {
    throw new Error("使用 AI 兼容接口需要配置 API Key 和模型");
  }

  const baseUrl = buildDefaultBaseUrl(runtimeConfig.provider, runtimeConfig.baseUrl, model);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(buildAiRequestPayload(messages, runtimeConfig, { ...options, stream: true }))
  });

  if (!response.ok) {
    const raw = await response.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      payload = null;
    }
    throw new Error(payload?.error?.message || raw || "AI 服务请求失败");
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const data = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (data) {
        if (data === "[DONE]") {
          return;
        }

        try {
          const payload = JSON.parse(data);
          const delta = extractTextContent(payload?.choices?.[0]?.delta?.content);
          if (delta) {
            yield delta;
          }
        } catch (_error) {
          // Ignore malformed chunks and continue reading the stream.
        }
      }

      boundary = buffer.indexOf("\n\n");
    }

    if (done) break;
  }
}

async function runAiStage({ projectId, chapterId, workflow, stage, messages, temperature, aiConfig }) {
  const runtimeConfig = aiConfig || (await resolveAiRuntimeConfig());
  const inputPayload = {
    temperature,
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
    thinkingMode: runtimeConfig.thinkingMode || "",
    reasoningEffort: runtimeConfig.reasoningEffort || "",
    messages
  };

  try {
    const outputText = await callOpenAICompatible(messages, runtimeConfig, { temperature });
    await recordIoLog({
      projectId,
      chapterId,
      workflow,
      stage,
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      inputPayload,
      outputText
    });
    return outputText;
  } catch (error) {
    await recordIoLog({
      projectId,
      chapterId,
      workflow,
      stage,
      status: "error",
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      inputPayload,
      outputText: error.message
    });
    throw error;
  }
}

async function runAiStageStream({
  projectId,
  chapterId,
  workflow,
  stage,
  messages,
  temperature,
  aiConfig,
  onDelta
}) {
  const runtimeConfig = aiConfig || (await resolveAiRuntimeConfig());
  const inputPayload = {
    temperature,
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
    thinkingMode: runtimeConfig.thinkingMode || "",
    reasoningEffort: runtimeConfig.reasoningEffort || "",
    messages
  };

  let outputText = "";

  try {
    for await (const delta of streamOpenAICompatible(messages, runtimeConfig, { temperature })) {
      outputText += delta;
      await onDelta?.(delta, outputText);
    }

    await recordIoLog({
      projectId,
      chapterId,
      workflow,
      stage,
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      inputPayload,
      outputText
    });

    return outputText;
  } catch (error) {
    await recordIoLog({
      projectId,
      chapterId,
      workflow,
      stage,
      status: "error",
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      inputPayload,
      outputText: outputText || error.message
    });
    throw error;
  }
}

async function generateChapter(project, input, options = {}) {
  const workflow = input.workflow || options.workflow || "chapter_generate";
  const runtime = options.runtime || null;
  const sessionType = workflow === "chapter_regenerate" ? "regenerate" : "generate";
  const targetMode = workflow === "chapter_regenerate" ? "selected" : "next";
  const workflowChapterId = input.chapterId || "";
  const {
    input: normalizedInput,
    chapterNumber,
    title,
    contract,
    plan,
    preflightGuard,
    aiConfig
  } = await prepareChapterWorkflow(project, input, {
    workflow,
    plannerStage: "planner",
    guardStage: "guard_preflight",
    runtime
  });
  const settingsSummary = buildSettingsSummary(project, normalizedInput.selectedSettingIds);
  let rawContent = "";

  runtime?.stage("writer", "running", {
    message: "正在生成正文审阅稿。"
  });

  if (isRemoteAiProvider(aiConfig.provider)) {
    const writerMessages = buildChapterWriterMessages({
      project,
      settingsSummary,
      chapterNumber,
      title,
      input: normalizedInput,
      plan,
      contract,
      headingLine: buildChapterHeading(chapterNumber, title)
    });
    rawContent = runtime
      ? await runAiStageStream({
          projectId: project.id,
          chapterId: input.chapterId,
          workflow,
          stage: "writer",
          messages: writerMessages,
          temperature: 0.72,
          aiConfig,
          onDelta: async (_delta, fullText) => {
            runtime.delta("writer", _delta, fullText, {
              meta: {
                units: countTextUnits(fullText)
              }
            });
          }
        })
      : await runAiStage({
          projectId: project.id,
          chapterId: input.chapterId,
          workflow,
          stage: "writer",
          messages: writerMessages,
          temperature: 0.72,
          aiConfig
        });
  } else {
    rawContent = localChapter(project, normalizedInput, plan, contract);
    await recordIoLog({
      projectId: project.id,
      chapterId: input.chapterId,
      workflow,
      stage: "writer-local",
      inputPayload: normalizedInput,
      outputPayload: {
        plan,
        contract
      },
      outputText: rawContent
    });
    runtime?.delta("writer", rawContent, rawContent, {
      meta: {
        units: countTextUnits(rawContent)
      }
    });
  }

  const normalizedWriterContent = normalizeGeneratedChapterContent(rawContent, chapterNumber, title);
  runtime?.stage("writer", "done", {
    message: `Writer 已完成，产出 ${countTextUnits(normalizedWriterContent)} 字。`,
    meta: {
      units: countTextUnits(normalizedWriterContent)
    }
  });
  runtime?.snapshot({
    generationWorkflow: buildLiveGenerationWorkflowSnapshot({
      chapterId: workflowChapterId,
      chapterNumber,
      title,
      contract,
      plan,
      preflightGuard,
      writerContent: normalizedWriterContent,
      reviewContent: normalizedWriterContent,
      repaired: false,
      sessionType,
      targetMode
    })
  });

  runtime?.stage("guard", "running", {
    message: "正在审核设定冲突、人物动机与伏笔漏接。"
  });
  const postGuard = await runChapterGuardStage({
    project,
    input: normalizedInput,
    contract,
    plan,
    content: normalizedWriterContent,
    phase: "postwrite",
    workflow,
    stage: "guard",
    aiConfig
  });
  runtime?.stage("guard", "done", {
    message: `Post Guard ${postGuard.score ?? "--"} / ${postGuard.status || "pass"}`,
    meta: {
      score: postGuard.score ?? null,
      status: postGuard.status || "pass",
      findingsCount: Array.isArray(postGuard.findings) ? postGuard.findings.length : 0,
      repairPlanCount: normalizeWorkflowList(postGuard.repairPlan, [], 6).length
    }
  });

  let finalContent = normalizedWriterContent;
  let repaired = false;
  const shouldRepair =
    postGuard.findings.some((item) => item.target === "content") ||
    normalizeWorkflowList(postGuard.repairPlan, [], 6).length > 0;
  if (shouldRepair) {
    runtime?.stage("repair", "running", {
      message: "正在执行最小修订，尽量只改必要段落。"
    });
    finalContent = normalizeGeneratedChapterContent(
      await runChapterRepairStage({
        project,
        input: normalizedInput,
        contract,
        plan,
        content: normalizedWriterContent,
        guardReport: postGuard,
        workflow,
        stage: "repair",
        aiConfig
      }),
      chapterNumber,
      title
    );
    repaired = finalContent !== normalizedWriterContent;
    runtime?.stage("repair", repaired ? "done" : "skipped", {
      message: repaired
        ? `Repair 已输出最小修订稿，当前 ${countTextUnits(finalContent)} 字。`
        : "Repair 已评估，但无需改动正文。",
      meta: {
        applied: repaired,
        units: countTextUnits(finalContent)
      }
    });
  } else {
    runtime?.stage("repair", "skipped", {
      message: "Post Guard 未要求最小修订。"
    });
  }

  runtime?.snapshot({
    generationWorkflow: buildLiveGenerationWorkflowSnapshot({
      chapterId: workflowChapterId,
      chapterNumber,
      title,
      contract,
      plan,
      preflightGuard,
      postGuard,
      writerContent: normalizedWriterContent,
      reviewContent: finalContent,
      repaired,
      sessionType,
      targetMode
    })
  });

  return {
    content: finalContent,
    writerContent: normalizedWriterContent,
    beats: plan.beats,
    plan,
    contract,
    preflightGuard,
    postGuard,
    repaired,
    title,
    chapterNumber
  };
}

function analyzeChapter(project, chapter) {
  const findings = [];
  const text = chapter?.content || "";
  const characterNames = project.settings
    .filter((item) => item.type === "character")
    .map((item) => item.name);
  const unresolvedThreads = project.foreshadows.filter((item) => item.status !== "已回收");

  if (characterNames.length && !characterNames.some((name) => text.includes(name))) {
    findings.push({
      level: "红",
      title: "角色锚点不足",
      detail: "正文没有明显调用核心角色名称，人物线可能与主线脱节。"
    });
  }

  if (!text.includes("代价") && !text.includes("阻力") && !text.includes("冲突")) {
    findings.push({
      level: "黄",
      title: "推进阻力偏弱",
      detail: "建议补充失败风险、能力限制或关系代价，避免爽点悬空。"
    });
  }

  if (text.length > 200 && !text.includes("钩子") && !text.includes("名字")) {
    findings.push({
      level: "黄",
      title: "结尾悬念不显性",
      detail: "连载章节最好在结尾留下可追读的问题或新危机。"
    });
  }

  if (unresolvedThreads.length >= 3) {
    findings.push({
      level: "黄",
      title: "伏笔堆积",
      detail: `当前有 ${unresolvedThreads.length} 条伏笔未回收，可考虑在近三章安排一次小回收。`
    });
  }

  if (!findings.length) {
    findings.push({
      level: "绿",
      title: "结构稳定",
      detail: "章节目标、冲突和结尾承接完整，暂未发现明显设定冲突。"
    });
  }

  const penalty = findings.reduce(
    (total, item) => total + (item.level === "红" ? 25 : item.level === "黄" ? 12 : 0),
    0
  );

  return {
    id: id("report"),
    chapterId: chapter?.id || "",
    chapterTitle: chapter?.title || "未命名章节",
    score: Math.max(40, 96 - penalty),
    findings,
    createdAt: now()
  };
}

function buildLocalPolishText(input) {
  const prefix = {
    更网文化: "节奏更快，冲突更直给，段落压缩后突出目标和反转：",
    更文学化: "语句更克制，意象更集中，情绪藏在动作和环境里：",
    更紧张: "压迫感前置，动作和感官细节更密：",
    更暧昧: "保留分寸，把关系张力放在停顿、眼神和未说出口的话里：",
    更克制: "删去外露解释，用短句和留白推进：",
    更热血: "强化目标、代价和主动反击：",
    更悬疑: "隐藏部分答案，放大异常细节和误导线索：",
    更短剧化: "场景目标更明确，冲突更快爆发，结尾反转更利于切集："
  }[input.style] || "按指定方向改写：";

  return [
    prefix,
    "",
    `当前基调：${input.tone}`,
    "",
    input.source
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => `${index === 0 ? "" : "随后，"}${line}`)
      .join("\n\n")
  ].join("\n");
}

function buildLocalModifyText(input) {
  const source = String(input.source || "").replace(/\r\n/g, "\n").trim();
  if (!source) return "";

  const instruction = String(input.instruction || "").trim();
  if (!instruction) return source;

  let result = source;

  if (/(精简|压缩|更短|删减|收紧)/.test(instruction)) {
    result = result
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/，于是/g, "，")
      .replace(/，然后/g, "，");
  }

  if (/(口语|直白|更通俗)/.test(instruction)) {
    result = result
      .replace(/然而/g, "但")
      .replace(/因此/g, "所以")
      .replace(/并且/g, "而且");
  }

  if (/(更紧张|压迫|危机)/.test(instruction) && !result.includes("呼吸")) {
    result = result.replace(/\n\n/, "\n\n呼吸像被什么拧紧了一瞬。\n");
  }

  return result;
}

function chunkTextForStream(text, size = 140) {
  const source = String(text || "");
  if (!source) return [];

  const chunks = [];
  for (let index = 0; index < source.length; index += size) {
    chunks.push(source.slice(index, index + size));
  }
  return chunks;
}

async function transformText(project, input) {
  const mode = normalizeTransformMode(input.mode);
  const tone = normalizeTone(input.tone, project.defaultTone);
  const normalizedInput = { ...input, mode, tone };
  const aiConfig = await resolveAiRuntimeConfig();
  const workflow = mode === "modify" ? "modify" : "rewrite";
  const stage = mode === "modify" ? "modify" : "rewrite";

  if (isRemoteAiProvider(aiConfig.provider)) {
    return runAiStage({
      projectId: project.id,
      chapterId: input.chapterId || "",
      workflow,
      stage,
      messages: buildTransformMessages({
        project,
        settingsSummary: buildSettingsSummary(project),
        input: normalizedInput
      }),
      temperature: mode === "modify" ? 0.45 : 0.7,
      aiConfig
    });
  }

  const result = mode === "modify" ? buildLocalModifyText(normalizedInput) : buildLocalPolishText(normalizedInput);

  await recordIoLog({
    projectId: project.id,
    chapterId: input.chapterId || "",
    workflow,
    stage: "local",
    inputPayload: normalizedInput,
    outputText: result
  });

  return result;
}

async function streamTransformText(project, input, onDelta) {
  const mode = normalizeTransformMode(input.mode);
  const tone = normalizeTone(input.tone, project.defaultTone);
  const normalizedInput = { ...input, mode, tone };
  const aiConfig = await resolveAiRuntimeConfig();
  const workflow = mode === "modify" ? "modify" : "rewrite";
  const stage = mode === "modify" ? "modify" : "rewrite";

  if (isRemoteAiProvider(aiConfig.provider)) {
    return runAiStageStream({
      projectId: project.id,
      chapterId: input.chapterId || "",
      workflow,
      stage,
      messages: buildTransformMessages({
        project,
        settingsSummary: buildSettingsSummary(project),
        input: normalizedInput
      }),
      temperature: mode === "modify" ? 0.45 : 0.7,
      aiConfig,
      onDelta
    });
  }

  const result = mode === "modify" ? buildLocalModifyText(normalizedInput) : buildLocalPolishText(normalizedInput);
  let outputText = "";
  for (const chunk of chunkTextForStream(result)) {
    outputText += chunk;
    await onDelta?.(chunk, outputText);
  }
  await recordIoLog({
    projectId: project.id,
    chapterId: input.chapterId || "",
    workflow,
    stage: "local-stream",
    inputPayload: normalizedInput,
    outputText: result
  });
  return result;
}

async function rewriteText(project, input) {
  return transformText(project, {
    ...input,
    mode: "polish"
  });
}

function initSseResponse(response) {
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();
}

function writeSseEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const workflowRuntimeStageDefinitions = {
  preview: ["contract", "planner", "guard_preflight"],
  generate: ["contract", "planner", "guard_preflight", "writer", "guard", "repair", "review_session"],
  regenerate: ["contract", "planner", "guard_preflight", "writer", "guard", "repair", "review_session"]
};

const workflowRuntimeStageLabels = {
  contract: "Contract",
  planner: "Planner",
  guard_preflight: "Preflight Guard",
  writer: "Writer",
  guard: "Post Guard",
  repair: "Repair",
  review_session: "Review Session"
};

function getWorkflowRuntimeStages(mode = "generate") {
  return (workflowRuntimeStageDefinitions[mode] || workflowRuntimeStageDefinitions.generate).map((key) => ({
    key,
    label: workflowRuntimeStageLabels[key] || key
  }));
}

function createWorkflowRuntimeEmitter(response, config = {}) {
  const mode = config.mode || "generate";
  const workflow = config.workflow || "";
  const basePayload = {
    mode,
    workflow
  };

  return {
    start(meta = {}) {
      writeSseEvent(response, {
        type: "run_started",
        ...basePayload,
        startedAt: now(),
        stages: getWorkflowRuntimeStages(mode),
        ...meta
      });
    },
    stage(key, status, payload = {}) {
      writeSseEvent(response, {
        type: "stage",
        ...basePayload,
        key,
        status,
        label: workflowRuntimeStageLabels[key] || key,
        updatedAt: now(),
        ...payload
      });
    },
    snapshot(payload = {}) {
      writeSseEvent(response, {
        type: "snapshot",
        ...basePayload,
        updatedAt: now(),
        ...payload
      });
    },
    delta(key, delta, result, payload = {}) {
      writeSseEvent(response, {
        type: "delta",
        ...basePayload,
        key,
        label: workflowRuntimeStageLabels[key] || key,
        delta,
        result,
        updatedAt: now(),
        ...payload
      });
    },
    done(payload = {}) {
      writeSseEvent(response, {
        type: "done",
        ...basePayload,
        finishedAt: now(),
        ...payload
      });
    },
    error(error) {
      writeSseEvent(response, {
        type: "error",
        ...basePayload,
        error: error?.message || "请求失败"
      });
    }
  };
}

function buildLocalSettingExtraction(project, input) {
  const source = String(input.source || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!source) return [];

  const sentences = source
    .split(/[\n。！？]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 16);

  const candidates = (sentences.length ? sentences : [source])
    .filter((item) => /是|为|叫做|名为|位于|拥有|负责|规则|能力|道具|角色|地点|世界/.test(item))
    .slice(0, 8);

  const items = (candidates.length ? candidates : sentences.slice(0, 5)).map((item, index) =>
    sanitizeSettingExtractionItem(
      {
        type: guessSettingTypeFromText(item),
        name: extractNameFromSentence(item, guessSettingTypeFromText(item), index),
        summary: item,
        traits: "",
        rules: /必须|不能|不可|只会|只有|无法|不得/.test(item) ? item : "",
        evidence: item.slice(0, 80)
      },
      index
    )
  );

  const existingKeys = new Set(
    (project.settings || []).map((item) => `${normalizeSettingType(item.type)}::${String(item.name || "").trim()}`)
  );
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.type}::${item.name}`;
    if (!item.name || !item.summary) return false;
    if (existingKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function extractSettings(project, input) {
  const normalizedInput = {
    ...input,
    sourceMode: input.sourceMode === "chapter" ? "chapter" : "manual",
    source: String(input.source || "").trim()
  };

  if (!normalizedInput.source) {
    return [];
  }

  const aiConfig = await resolveAiRuntimeConfig();

  if (isRemoteAiProvider(aiConfig.provider)) {
    const raw = await runAiStage({
      projectId: project.id,
      chapterId: input.chapterId || "",
      workflow: "setting_extract",
      stage: "extract",
      messages: buildSettingExtractionMessages({
        project,
        settingsSummary: buildSettingsSummary(project),
        input: normalizedInput
      }),
      temperature: 0.35,
      aiConfig
    });

    const parsed = parseSettingExtractionResult(raw);
    if (parsed.length) {
      const existingKeys = new Set(
        (project.settings || []).map(
          (item) => `${normalizeSettingType(item.type)}::${String(item.name || "").trim()}`
        )
      );
      const seen = new Set();

      return parsed.filter((item) => {
        const key = `${item.type}::${item.name}`;
        if (existingKeys.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return buildLocalSettingExtraction(project, normalizedInput);
  }

  const result = buildLocalSettingExtraction(project, normalizedInput);
  await recordIoLog({
    projectId: project.id,
    chapterId: input.chapterId || "",
    workflow: "setting_extract",
    stage: "local",
    inputPayload: normalizedInput,
    outputPayload: result
  });
  return result;
}

function localAssistText(project, input) {
  const source = input.source?.trim() || "";
  const mode = input.mode === "polish" ? "polish" : "expand";
  const fieldLabel = input.fieldLabel || "内容";
  const section = input.section || "创作表单";

  const fieldSeed = {
    章节标题: `${project.title}的新转折`,
    本章目标: `推进《${project.title}》主线，并让角色在代价明确的前提下取得阶段进展。`,
    核心冲突: "把既有设定中的限制、对手压迫和人物情绪同时推到台前，逼迫角色做出不可逆选择。",
    结尾钩子: "就在局面看似稳定时，一个更危险的名字被当众提起。",
    名称: `${project.genre}线核心设定`,
    核心设定: `它与《${project.title}》的主线直接相关，既能推动剧情，也会在关键时刻形成新的限制或秘密。`,
    特征标签: "高压、隐忍、代价、反转",
    "禁忌/不可违背": "必须遵守既有世界规则，不能无代价突破，也不能让角色动机前后矛盾。",
    伏笔内容: `表面上只是一个小异常，实际上会在《${project.title}》后续章节里指向更深的真相。`,
    埋设章节: "第 3 章",
    预期回收: "第 12 章",
    "相关人物/道具": "主角、关键道具、核心线索"
  }[fieldLabel] || `${section}需要补齐一段更完整的${fieldLabel}。`;

  if (fieldLabel === "埋设章节" || fieldLabel === "预期回收") {
    return source || fieldSeed;
  }

  if (fieldLabel === "特征标签" || fieldLabel === "相关人物/道具") {
    if (!source) return fieldSeed;
    return mode === "polish"
      ? source
          .split(/[、，,]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 6)
          .join("、")
      : `${source.replace(/[、，,]+$/, "")}、代价、反差`;
  }

  if (fieldLabel === "章节标题" || fieldLabel === "名称") {
    if (!source) return fieldSeed;
    return mode === "polish" ? source.replace(/\s+/g, "") : `${source}之后`;
  }

  if (!source) return fieldSeed;

  if (mode === "polish") {
    return `围绕“${source}”收紧表达，保留原意，同时把语气调整得更适合${section}直接填写。`;
  }

  return `${source}\n\n补充展开：继续把人物动机、具体阻力、情绪变化或后续影响写清楚，让这段内容能够直接用于${section}。`;
}

async function assistField(project, input) {
  const aiConfig = await resolveAiRuntimeConfig();

  if (isRemoteAiProvider(aiConfig.provider)) {
    return runAiStage({
      projectId: project.id,
      workflow: "assist",
      stage: input.mode === "polish" ? "polish" : "expand",
      messages: buildAssistMessages({
        project,
        settingsSummary: buildSettingsSummary(project),
        input: {
          ...input,
          guidance: input.guidance || "保持信息密度高，可直接粘贴，避免空话。"
        },
        fieldLabel: input.fieldLabel || "内容",
        fallbackValue: input.source?.trim() || "（空）"
      }),
      temperature: 0.55,
      aiConfig
    });
  }

  const result = localAssistText(project, input);
  await recordIoLog({
    projectId: project.id,
    workflow: "assist",
    stage: input.mode === "polish" ? "polish-local" : "expand-local",
    inputPayload: input,
    outputText: result
  });
  return result;
}

function buildExportContent(project) {
  const chapters = [...project.chapters]
    .sort((a, b) => a.number - b.number)
    .map((chapter) =>
      [
        `## 第 ${chapter.number} 章 ${chapter.title}`,
        "",
        `语气：${chapter.tone}`,
        "",
        chapter.content
      ].join("\n")
    )
    .join("\n\n---\n\n");

  return [
    `# ${project.title}`,
    "",
    `类型：${project.genre}`,
    `状态：${project.status}`,
    `创作台语气：${project.defaultTone}`,
    `目标读者：${project.targetAudience || "未设置"}`,
    "",
    "## 核心卖点",
    "",
    project.premise || "未填写",
    "",
    "## 正文",
    "",
    chapters || "暂无章节"
  ].join("\n");
}

async function createChapterVersion(client, payload) {
  await client.query(
    `INSERT INTO chapter_versions (
      id, project_id, chapter_id, title, tone, content, source, style, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id("version"),
      payload.projectId,
      payload.chapterId,
      payload.title,
      payload.tone,
      payload.content,
      payload.source,
      payload.style || "",
      now()
    ]
  );
}

function buildGenerationWorkflowResult({
  generated,
  sessionId = "",
  sessionType = "generate",
  targetMode = "next",
  pendingReview = false
}) {
  const writerContent = String(generated.writerContent || generated.content || "").trim();
  const repairedContent = String(generated.content || "").trim();

  return {
    sessionId,
    sessionType,
    targetMode,
    pendingReview,
    chapterNumber: generated.chapterNumber,
    title: generated.title,
    contract: generated.contract,
    plan: generated.plan,
    preflightGuard: generated.preflightGuard,
    postGuard: generated.postGuard,
    repair: {
      applied: Boolean(generated.repaired),
      originalContent: writerContent,
      repairedContent,
      reviewContent: repairedContent || writerContent,
      repairPlan: normalizeWorkflowList(generated.postGuard?.repairPlan, [], 6)
    }
  };
}

function buildLiveGenerationWorkflowSnapshot({
  chapterId = "",
  chapterNumber,
  title,
  contract,
  plan,
  preflightGuard,
  postGuard = null,
  writerContent = "",
  reviewContent = "",
  repaired = false,
  sessionType = "generate",
  targetMode = "next"
}) {
  return {
    chapterId,
    ...buildGenerationWorkflowResult({
      generated: {
        chapterNumber,
        title,
        contract,
        plan,
        preflightGuard,
        postGuard,
        writerContent,
        content: reviewContent || writerContent,
        repaired
      },
      sessionType,
      targetMode,
      pendingReview: false
    })
  };
}

function buildGenerationSessionPayload({
  input,
  generated,
  sessionType = "generate",
  targetMode = "next",
  chapterId = ""
}) {
  const constraintPolicy = normalizeConstraintPolicy(input.constraintPolicy);
  const selectedSettingIds = Array.isArray(input.selectedSettingIds)
    ? Array.from(
        new Set(
          input.selectedSettingIds
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        )
      )
    : [];

  return {
    input: {
      title: String(input.title || "").trim(),
      goal: String(input.goal || "").trim(),
      conflict: String(input.conflict || "").trim(),
      hook: String(input.hook || "").trim(),
      tone: String(input.tone || "").trim(),
      wordCount: Number(input.wordCount || 1800),
      selectedSettingIds,
      constraintPolicy
    },
    persist: {
      mode: sessionType,
      chapterId,
      chapterNumber: generated.chapterNumber,
      title: generated.title,
      goal: String(input.goal || "").trim(),
      conflict: String(input.conflict || "").trim(),
      hook: String(input.hook || "").trim(),
      tone: String(input.tone || "").trim(),
      wordCount: Number(input.wordCount || 1800),
      selectedSettingIds,
      constraintPolicy
    },
    workflow: buildGenerationWorkflowResult({
      generated,
      sessionType,
      targetMode,
      pendingReview: true
    })
  };
}

function resolveWorkflowReviewContent(workflow, override) {
  if (override !== undefined) {
    return String(override ?? "").trim();
  }

  return String(
    workflow?.repair?.reviewContent ||
      workflow?.repair?.repairedContent ||
      workflow?.repair?.originalContent ||
      ""
  ).trim();
}

async function createGenerationSessionRecord({
  projectId,
  chapterId = "",
  sessionType = "generate",
  targetMode = "next",
  payload
}) {
  const sessionId = id("generation_session");
  const timestamp = now();
  await pool.query(
    `UPDATE generation_sessions
     SET status = 'discarded',
         updated_at = $1
     WHERE project_id = $2
       AND session_type = $3
       AND target_mode = $4
       AND chapter_id = $5
       AND status = 'pending'`,
    [timestamp, projectId, sessionType, targetMode, chapterId]
  );
  await pool.query(
    `INSERT INTO generation_sessions (
      id, project_id, chapter_id, session_type, target_mode, status, payload, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'pending', $6::jsonb, $7, $7
    )`,
    [sessionId, projectId, chapterId, sessionType, targetMode, JSON.stringify(payload || {}), timestamp]
  );
  return sessionId;
}

async function createPendingGenerationReview({
  projectId,
  workflow,
  ioChapterId = "",
  sessionRecordChapterId = "",
  workflowChapterId = "",
  inputPayload,
  generated,
  sessionType = "generate",
  targetMode = "next"
}) {
  const sessionPayload = buildGenerationSessionPayload({
    input: inputPayload,
    generated,
    sessionType,
    targetMode,
    chapterId: workflowChapterId
  });
  const sessionId = await createGenerationSessionRecord({
    projectId,
    chapterId: sessionRecordChapterId,
    sessionType,
    targetMode,
    payload: sessionPayload
  });
  const reviewWorkflow = {
    ...sessionPayload.workflow,
    sessionId
  };

  await recordIoLog({
    projectId,
    chapterId: ioChapterId,
    workflow,
    stage: "review_session",
    inputPayload,
    outputPayload: reviewWorkflow,
    outputText: reviewWorkflow.repair?.reviewContent || generated.content
  });

  return {
    sessionId,
    workflow: reviewWorkflow
  };
}

async function readGenerationSessionRecord(projectId, sessionId) {
  const result = await pool.query(
    "SELECT * FROM generation_sessions WHERE id = $1 AND project_id = $2 LIMIT 1",
    [sessionId, projectId]
  );
  const row = result.rows[0];
  if (!row) {
    const error = new Error("生成审阅会话不存在。");
    error.statusCode = 404;
    throw error;
  }
  return row;
}

async function commitGenerationSession(projectId, sessionId, options = {}) {
  const sessionRow = await readGenerationSessionRecord(projectId, sessionId);
  if (sessionRow.status !== "pending") {
    const error = new Error("该生成会话已经处理过，请重新生成审阅稿。");
    error.statusCode = 409;
    throw error;
  }

  const session = toGenerationSession(sessionRow);
  const workflow = session.workflow;
  const persist = session.persist || {};
  const finalContent = resolveWorkflowReviewContent(workflow, options.content);

  if (!workflow || !persist?.mode) {
    const error = new Error("生成会话数据不完整，无法提交。");
    error.statusCode = 400;
    throw error;
  }

  if (!finalContent) {
    const error = new Error("审阅正文不能为空。");
    error.statusCode = 400;
    throw error;
  }

  const project = await readProject(projectId);
  const selectedSettingIds = normalizeSelectedSettingIds(persist.selectedSettingIds, project);
  const beats = Array.isArray(workflow.plan?.beats) ? workflow.plan.beats : [];
  const savedAt = now();
  const nextTitle = workflow.title || persist.title || "";
  const updatedWorkflow = {
    ...workflow,
    pendingReview: false,
    repair: {
      ...(workflow.repair || {}),
      reviewContent: finalContent,
      repairedContent:
        workflow.repair?.applied && workflow.repair?.repairedContent
          ? workflow.repair.repairedContent
          : finalContent
    }
  };
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (persist.mode === "generate") {
      if (project.chapters.some((chapter) => chapter.number === Number(persist.chapterNumber || workflow.chapterNumber))) {
        const error = new Error("待入库章节号已经被占用，请重新生成审阅稿。");
        error.statusCode = 409;
        throw error;
      }

      await client.query(
        `INSERT INTO chapters (
          id, project_id, number, title, goal, conflict, hook, tone, word_count,
          selected_setting_ids, beats, content, draft_title, draft_tone, draft_content,
          draft_saved_at, updated_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18
        )`,
        [
          persist.chapterId,
          projectId,
          Number(persist.chapterNumber || workflow.chapterNumber),
          nextTitle,
          persist.goal || "",
          persist.conflict || "",
          persist.hook || "",
          persist.tone || project.defaultTone,
          Number(persist.wordCount || 1800),
          JSON.stringify(selectedSettingIds),
          JSON.stringify(beats),
          finalContent,
          nextTitle,
          persist.tone || project.defaultTone,
          finalContent,
          savedAt,
          savedAt,
          savedAt
        ]
      );

      await createChapterVersion(client, {
        projectId,
        chapterId: persist.chapterId,
        title: nextTitle,
        tone: persist.tone || project.defaultTone,
        content: finalContent,
        source: "generated-review",
        style: "审阅入库"
      });

      await client.query("UPDATE projects SET status = $1 WHERE id = $2", ["连载中", projectId]);
    } else {
      const chapter = findChapter(project, persist.chapterId);
      const current = getChapterEditorState(chapter, project);

      await createChapterVersion(client, {
        projectId,
        chapterId: persist.chapterId,
        title: current.title,
        tone: current.tone,
        content: current.content,
        source: "regenerate-backup",
        style: "审阅前备份"
      });

      await client.query(
        `UPDATE chapters
         SET title = $1,
             goal = $2,
             conflict = $3,
             hook = $4,
             tone = $5,
             word_count = $6,
             selected_setting_ids = $7::jsonb,
             beats = $8::jsonb,
             content = $9,
             draft_title = $1,
             draft_tone = $5,
             draft_content = $9,
             draft_saved_at = $10,
             updated_at = $10
         WHERE id = $11 AND project_id = $12`,
        [
          nextTitle,
          persist.goal || chapter.goal || "",
          persist.conflict || chapter.conflict || "",
          persist.hook || chapter.hook || "",
          persist.tone || chapter.tone || project.defaultTone,
          Number(persist.wordCount || chapter.wordCount || 1800),
          JSON.stringify(selectedSettingIds),
          JSON.stringify(beats),
          finalContent,
          savedAt,
          persist.chapterId,
          projectId
        ]
      );
    }

    await client.query(
      `UPDATE generation_sessions
       SET status = 'committed',
           payload = $1::jsonb,
           updated_at = $2,
           committed_at = $2
       WHERE id = $3 AND project_id = $4`,
      [
        JSON.stringify({
          ...sessionRow.payload,
          workflow: updatedWorkflow
        }),
        savedAt,
        sessionId,
        projectId
      ]
    );

    await client.query("COMMIT");

    return {
      mode: persist.mode,
      chapterId: persist.chapterId,
      workflow: updatedWorkflow
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function discardGenerationSession(projectId, sessionId) {
  const sessionRow = await readGenerationSessionRecord(projectId, sessionId);
  if (sessionRow.status !== "pending") {
    return;
  }

  await pool.query(
    `UPDATE generation_sessions
     SET status = 'discarded',
         updated_at = $1
     WHERE id = $2 AND project_id = $3`,
    [now(), sessionId, projectId]
  );
}

app.get("/api/state", async (_request, response, next) => {
  try {
    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai-profiles", async (request, response, next) => {
  const client = await pool.connect();
  try {
    const profileId = id("ai_profile");
    const savedAt = now();
    const profile = sanitizeAiProfileInput(request.body);

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ai_profiles (
        id, name, provider, api_key, base_url, model, thinking_mode,
        reasoning_effort, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        profileId,
        profile.name,
        profile.provider,
        profile.apiKey,
        profile.baseUrl,
        profile.model,
        profile.thinkingMode,
        profile.reasoningEffort,
        savedAt
      ]
    );
    await setActiveAiProfile(client, profileId);
    await client.query("COMMIT");

    response.json({ ...(await readData()), activeAiProfileId: profileId });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/ai-profiles/:profileId", async (request, response, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profileResult = await client.query("SELECT * FROM ai_profiles WHERE id = $1 FOR UPDATE", [
      request.params.profileId
    ]);
    if (!profileResult.rowCount) {
      const error = new Error("AI 配置不存在");
      error.statusCode = 404;
      throw error;
    }

    const existingProfile = toAiProfile(profileResult.rows[0]);
    const profile = sanitizeAiProfileInput(request.body, existingProfile);
    const savedAt = now();

    await client.query(
      `UPDATE ai_profiles
       SET name = $1,
           provider = $2,
           api_key = $3,
           base_url = $4,
           model = $5,
           thinking_mode = $6,
           reasoning_effort = $7,
           updated_at = $8
       WHERE id = $9`,
      [
        profile.name,
        profile.provider,
        profile.apiKey,
        profile.baseUrl,
        profile.model,
        profile.thinkingMode,
        profile.reasoningEffort,
        savedAt,
        request.params.profileId
      ]
    );

    if (request.body.activate !== false) {
      await setActiveAiProfile(client, request.params.profileId);
    }

    await client.query("COMMIT");
    response.json({ ...(await readData()), activeAiProfileId: request.params.profileId });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/ai-profiles/:profileId/select", async (request, response, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profileResult = await client.query("SELECT id FROM ai_profiles WHERE id = $1 FOR UPDATE", [
      request.params.profileId
    ]);
    if (!profileResult.rowCount) {
      const error = new Error("AI 配置不存在");
      error.statusCode = 404;
      throw error;
    }

    await setActiveAiProfile(client, request.params.profileId);
    await client.query("COMMIT");
    response.json({ ...(await readData()), activeAiProfileId: request.params.profileId });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/ai-profiles/:profileId/delete", async (request, response, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const profileResult = await client.query("SELECT id FROM ai_profiles WHERE id = $1 FOR UPDATE", [
      request.params.profileId
    ]);
    if (!profileResult.rowCount) {
      const error = new Error("AI 配置不存在");
      error.statusCode = 404;
      throw error;
    }

    const countResult = await client.query("SELECT COUNT(*)::int AS count FROM ai_profiles");
    if ((countResult.rows[0]?.count || 0) <= 1) {
      throw new Error("至少保留一个 AI 配置");
    }

    const preferencesResult = await client.query(
      "SELECT active_ai_profile_id FROM app_preferences WHERE id = $1 FOR UPDATE",
      [APP_PREFERENCES_ID]
    );
    const activeProfileId = preferencesResult.rows[0]?.active_ai_profile_id || "";

    await client.query("DELETE FROM ai_profiles WHERE id = $1", [request.params.profileId]);

    if (activeProfileId === request.params.profileId) {
      const fallbackResult = await client.query(
        "SELECT id FROM ai_profiles ORDER BY updated_at DESC, created_at DESC LIMIT 1"
      );
      await setActiveAiProfile(client, fallbackResult.rows[0]?.id || null);
    }

    await client.query("COMMIT");
    response.json(await readData());
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/projects/:projectId/export", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const file = await exportProjectFile(project, request.query.format);
    setDownloadHeaders(response, file);
    response.send(file.body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/chapters/:chapterId/export", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const chapter = findChapter(project, request.params.chapterId);
    const file = await exportChapterFile(project, chapter, request.query.format);
    setDownloadHeaders(response, file);
    response.send(file.body);
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (request, response, next) => {
  try {
    const project = {
      id: id("project"),
      title: request.body.title?.trim() || "未命名小说",
      genre: request.body.genre || "玄幻",
      premise: request.body.premise?.trim() || "",
      targetAudience: request.body.targetAudience?.trim() || "",
      status: "筹备中",
      defaultTone: normalizeTone(request.body.defaultTone, "热血"),
      createdAt: now()
    };

    await pool.query(
      `INSERT INTO projects (
        id, title, genre, premise, target_audience, status, default_tone, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        project.id,
        project.title,
        project.genre,
        project.premise,
        project.targetAudience,
        project.status,
        project.defaultTone,
        project.createdAt
      ]
    );

    response.json({ ...(await readData()), activeProjectId: project.id });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/preferences", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);
    await pool.query("UPDATE projects SET default_tone = $1 WHERE id = $2", [
      normalizeTone(request.body.defaultTone, "热血"),
      request.params.projectId
    ]);
    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/delete", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const confirmationCode = request.body.confirmationCode?.trim().toUpperCase() || "";
    const expectedCode = buildProjectDeleteCode(project.id);

    if (confirmationCode !== expectedCode) {
      throw new Error("验证码不正确，项目未删除");
    }

    await pool.query("DELETE FROM projects WHERE id = $1", [project.id]);
    const data = await readData();
    response.json({ ...data, activeProjectId: data.projects[0]?.id || "" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/settings", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const type = normalizeSettingType(request.body.type);
      const categoryNumber = await getNextSettingCategoryNumber(
        client,
        request.params.projectId,
        type
      );

      await client.query(
        `INSERT INTO settings (
          id, project_id, type, category_number, name, summary, traits, rules, created_at
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id("setting"),
          request.params.projectId,
          type,
          categoryNumber,
          request.body.name?.trim() || "未命名设定",
          request.body.summary?.trim() || "",
          normalizeTraitTags(request.body.traits),
          request.body.rules?.trim() || "",
          now()
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/settings/extract", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const chapter = request.body.chapterId ? findChapter(project, request.body.chapterId) : null;
    const source =
      typeof request.body.source === "string"
        ? request.body.source
        : chapter
          ? chapter.draftContent || chapter.content || ""
          : "";

    const extractionResult = await extractSettings(project, {
      sourceMode: request.body.sourceMode,
      source,
      chapterId: chapter?.id || "",
      chapterNumber: chapter?.number,
      chapterTitle: chapter?.title || ""
    });

    response.json({ ...(await readData()), extractionResult });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/settings/import", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);

    const rawItems = Array.isArray(request.body.items) ? request.body.items : [];
    const items = rawItems
      .map((item, index) => sanitizeSettingExtractionItem(item, index))
      .filter((item) => item.name && item.summary);

    if (!items.length) {
      throw new Error("没有可导入的设定");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const item of items) {
        const type = normalizeSettingType(item.type);
        const categoryNumber = await getNextSettingCategoryNumber(
          client,
          request.params.projectId,
          type
        );

        await client.query(
          `INSERT INTO settings (
            id, project_id, type, category_number, name, summary, traits, rules, created_at
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id("setting"),
            request.params.projectId,
            type,
            categoryNumber,
            item.name,
            item.summary,
            normalizeTraitTags(item.traits),
            item.rules,
            now()
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    response.json({ ...(await readData()), importedCount: items.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/settings/:settingId", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const currentResult = await client.query(
        "SELECT type, category_number FROM settings WHERE id = $1 AND project_id = $2 FOR UPDATE",
        [request.params.settingId, request.params.projectId]
      );

      if (!currentResult.rowCount) {
        throw new Error("设定不存在");
      }

      const current = currentResult.rows[0];
      const type = normalizeSettingType(request.body.type);
      const categoryNumber =
        type === current.type
          ? current.category_number
          : await getNextSettingCategoryNumber(client, request.params.projectId, type);

      await client.query(
        `UPDATE settings
         SET type = $1,
             category_number = $2,
             name = $3,
             summary = $4,
             traits = $5,
             rules = $6
         WHERE id = $7 AND project_id = $8`,
        [
          type,
          categoryNumber,
          request.body.name?.trim() || "未命名设定",
          request.body.summary?.trim() || "",
          normalizeTraitTags(request.body.traits),
          request.body.rules?.trim() || "",
          request.params.settingId,
          request.params.projectId
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/settings-legacy", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);

    await pool.query(
      `INSERT INTO settings (id, project_id, type, name, summary, traits, rules, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id("setting"),
        request.params.projectId,
        request.body.type || "world",
        request.body.name?.trim() || "未命名设定",
        request.body.summary?.trim() || "",
        normalizeTraitTags(request.body.traits),
        request.body.rules?.trim() || "",
        now()
      ]
    );

    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/settings/:settingId/legacy", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);

    const result = await pool.query(
      `UPDATE settings
       SET type = $1,
           name = $2,
           summary = $3,
           traits = $4,
           rules = $5
       WHERE id = $6 AND project_id = $7`,
      [
        request.body.type || "world",
        request.body.name?.trim() || "未命名设定",
        request.body.summary?.trim() || "",
        normalizeTraitTags(request.body.traits),
        request.body.rules?.trim() || "",
        request.params.settingId,
        request.params.projectId
      ]
    );

    if (result.rowCount === 0) {
      throw new Error("设定不存在");
    }

    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/settings/:settingId/delete", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);

    const result = await pool.query("DELETE FROM settings WHERE id = $1 AND project_id = $2", [
      request.params.settingId,
      request.params.projectId
    ]);

    if (result.rowCount === 0) {
      throw new Error("设定不存在");
    }

    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/foreshadows", async (request, response, next) => {
  try {
    await readProject(request.params.projectId);

    await pool.query(
      `INSERT INTO foreshadows (
        id, project_id, content, planted_chapter, expected_payoff, related, status, warning, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id("thread"),
        request.params.projectId,
        request.body.content?.trim() || "",
        request.body.plantedChapter?.trim() || "",
        request.body.expectedPayoff?.trim() || "",
        request.body.related?.trim() || "",
        request.body.status || "未回收",
        "",
        now()
      ]
    );

    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/projects/:projectId/foreshadows/:threadId/status",
  async (request, response, next) => {
    try {
      await readProject(request.params.projectId);

      const status = ["未回收", "回收中", "已回收"].includes(request.body.status)
        ? request.body.status
        : "未回收";
      const warning = status === "已回收" ? "" : null;

      const result = await pool.query(
        `UPDATE foreshadows
         SET status = $1,
             warning = COALESCE($2, warning)
         WHERE id = $3 AND project_id = $4`,
        [status, warning, request.params.threadId, request.params.projectId]
      );

      if (result.rowCount === 0) {
        throw new Error("伏笔不存在");
      }

      response.json(await readData());
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/projects/:projectId/chapters/manual", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const createdAt = now();
    const chapterNumber = computeNextChapterNumber(project);
    const title = sanitizeChapterTitle(request.body.title, chapterNumber);
    const tone = normalizeTone(request.body.tone, project.defaultTone);
    const content = typeof request.body.content === "string" ? request.body.content : "";
    const chapter = {
      id: id("chapter"),
      number: chapterNumber,
      title,
      goal: request.body.goal?.trim() || "",
      conflict: request.body.conflict?.trim() || "",
      hook: request.body.hook?.trim() || "",
      tone,
      wordCount: Number(request.body.wordCount || 1800),
      selectedSettingIds: normalizeSelectedSettingIds(request.body.selectedSettingIds, project),
      beats:
        request.body.goal?.trim() || request.body.conflict?.trim() || request.body.hook?.trim()
          ? buildBeats(request.body, project, chapterNumber)
          : [],
      content,
      createdAt
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO chapters (
          id, project_id, number, title, goal, conflict, hook, tone, word_count,
          selected_setting_ids, beats, content, draft_title, draft_tone, draft_content,
          draft_saved_at, updated_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18
        )`,
        [
          chapter.id,
          request.params.projectId,
          chapter.number,
          chapter.title,
          chapter.goal,
          chapter.conflict,
          chapter.hook,
          chapter.tone,
          chapter.wordCount,
          JSON.stringify(chapter.selectedSettingIds),
          JSON.stringify(chapter.beats),
          chapter.content,
          chapter.title,
          chapter.tone,
          chapter.content,
          createdAt,
          createdAt,
          createdAt
        ]
      );

      await createChapterVersion(client, {
        projectId: request.params.projectId,
        chapterId: chapter.id,
        title: chapter.title,
        tone: chapter.tone,
        content: chapter.content,
        source: "manual",
        style: "手写初稿"
      });

      await client.query("UPDATE projects SET status = $1 WHERE id = $2", [
        "连载中",
        request.params.projectId
      ]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await recordIoLog({
      projectId: request.params.projectId,
      chapterId: chapter.id,
      workflow: "manual_chapter",
      stage: "save",
      inputPayload: {
        title: request.body.title || "",
        goal: request.body.goal || "",
        conflict: request.body.conflict || "",
        hook: request.body.hook || "",
        tone,
        wordCount: chapter.wordCount,
        selectedSettingIds: chapter.selectedSettingIds
      },
      outputPayload: {
        chapterNumber: chapter.number,
        title: chapter.title,
        beats: chapter.beats,
        selectedSettingIds: chapter.selectedSettingIds
      },
      outputText: chapter.content
    });

    response.json({ ...(await readData()), createdChapterId: chapter.id });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/chapters/generate", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const tone = normalizeTone(request.body.tone, project.defaultTone);
    const chapterNumber = computeNextChapterNumber(project);
    const chapterId = id("chapter");
    const generated = await generateChapter(project, {
      ...request.body,
      workflow: "chapter_generate",
      tone,
      chapterNumber,
      chapterId
    });

    if (request.body.reviewMode) {
      const reviewInput = {
        title: request.body.title || "",
        goal: request.body.goal || "",
        conflict: request.body.conflict || "",
        hook: request.body.hook || "",
        tone,
        wordCount: Number(request.body.wordCount || 1800),
        selectedSettingIds: normalizeSelectedSettingIds(request.body.selectedSettingIds, project),
        constraintPolicy: request.body.constraintPolicy
      };
      const reviewSession = await createPendingGenerationReview({
        projectId: request.params.projectId,
        workflow: "chapter_generate",
        workflowChapterId: chapterId,
        inputPayload: reviewInput,
        generated,
        sessionType: "generate",
        targetMode: "next"
      });

      response.json({
        ...(await readData()),
        pendingGenerationSessionId: reviewSession.sessionId,
        generationWorkflow: reviewSession.workflow
      });
      return;
    }

    const createdAt = now();
    const chapter = {
      id: chapterId,
      number: generated.chapterNumber,
      title: generated.title,
      goal: request.body.goal?.trim() || "",
      conflict: request.body.conflict?.trim() || "",
      hook: request.body.hook?.trim() || "",
      tone,
      wordCount: Number(request.body.wordCount || 1800),
      selectedSettingIds: normalizeSelectedSettingIds(request.body.selectedSettingIds, project),
      beats: generated.beats,
      content: generated.content,
      createdAt
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO chapters (
          id, project_id, number, title, goal, conflict, hook, tone, word_count,
          selected_setting_ids, beats, content, draft_title, draft_tone, draft_content,
          draft_saved_at, updated_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17, $18
        )`,
        [
          chapter.id,
          request.params.projectId,
          chapter.number,
          chapter.title,
          chapter.goal,
          chapter.conflict,
          chapter.hook,
          chapter.tone,
          chapter.wordCount,
          JSON.stringify(chapter.selectedSettingIds),
          JSON.stringify(chapter.beats),
          chapter.content,
          chapter.title,
          chapter.tone,
          chapter.content,
          createdAt,
          createdAt,
          createdAt
        ]
      );

      await createChapterVersion(client, {
        projectId: request.params.projectId,
        chapterId: chapter.id,
        title: chapter.title,
        tone: chapter.tone,
        content: chapter.content,
        source: "generated",
        style: "初稿"
      });

      await client.query("UPDATE projects SET status = $1 WHERE id = $2", [
        "连载中",
        request.params.projectId
      ]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await recordIoLog({
      projectId: request.params.projectId,
      chapterId: chapter.id,
      workflow: "chapter_generate",
      stage: "persist",
      inputPayload: {
        title: request.body.title || "",
        goal: request.body.goal || "",
        conflict: request.body.conflict || "",
        hook: request.body.hook || "",
        tone,
        wordCount: chapter.wordCount,
        selectedSettingIds: chapter.selectedSettingIds
      },
      outputPayload: {
        chapterNumber: chapter.number,
        title: chapter.title,
        beats: chapter.beats,
        selectedSettingIds: chapter.selectedSettingIds,
        contract: generated.contract,
        plan: generated.plan,
        preflightGuard: generated.preflightGuard,
        postGuard: generated.postGuard,
        repaired: generated.repaired
      },
      outputText: chapter.content
    });

    response.json({
      ...(await readData()),
      createdChapterId: chapter.id,
      generationWorkflow: {
        chapterId: chapter.id,
        chapterNumber: generated.chapterNumber,
        title: generated.title,
        contract: generated.contract,
        plan: generated.plan,
        preflightGuard: generated.preflightGuard,
        postGuard: generated.postGuard,
        repair: {
          applied: generated.repaired
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/projects/:projectId/chapters/:chapterId/regenerate",
  async (request, response, next) => {
    try {
      const project = await readProject(request.params.projectId);
      const chapter = findChapter(project, request.params.chapterId);
      const current = getChapterEditorState(chapter, project);
      const tone = normalizeTone(request.body.tone, current.tone);
      const titleInput = request.body.title?.trim() || current.title;
      const generated = await generateChapter(project, {
        ...request.body,
        workflow: "chapter_regenerate",
        title: titleInput,
        goal: request.body.goal?.trim() || chapter.goal || "",
        conflict: request.body.conflict?.trim() || chapter.conflict || "",
        hook: request.body.hook?.trim() || chapter.hook || "",
        tone,
        wordCount: Number(request.body.wordCount || chapter.wordCount || 1800),
        chapterNumber: chapter.number,
        chapterId: chapter.id
      });

      if (request.body.reviewMode) {
        const reviewInput = {
          title: titleInput,
          goal: request.body.goal?.trim() || chapter.goal || "",
          conflict: request.body.conflict?.trim() || chapter.conflict || "",
          hook: request.body.hook?.trim() || chapter.hook || "",
          tone,
          wordCount: Number(request.body.wordCount || chapter.wordCount || 1800),
          chapterNumber: chapter.number,
          selectedSettingIds: normalizeSelectedSettingIds(
            request.body.selectedSettingIds ?? chapter.selectedSettingIds,
            project
          ),
          constraintPolicy: request.body.constraintPolicy
        };
        const reviewSession = await createPendingGenerationReview({
          projectId: request.params.projectId,
          workflow: "chapter_regenerate",
          ioChapterId: request.params.chapterId,
          sessionRecordChapterId: chapter.id,
          workflowChapterId: chapter.id,
          inputPayload: reviewInput,
          generated,
          sessionType: "regenerate",
          targetMode: "selected"
        });

        response.json({
          ...(await readData()),
          pendingGenerationSessionId: reviewSession.sessionId,
          generationWorkflow: reviewSession.workflow
        });
        return;
      }

      const savedAt = now();
      const nextTitle = generated.title;
      const nextGoal = request.body.goal?.trim() || chapter.goal || "";
      const nextConflict = request.body.conflict?.trim() || chapter.conflict || "";
      const nextHook = request.body.hook?.trim() || chapter.hook || "";
      const nextWordCount = Number(request.body.wordCount || chapter.wordCount || 1800);
      const nextSelectedSettingIds = normalizeSelectedSettingIds(
        request.body.selectedSettingIds ?? chapter.selectedSettingIds,
        project
      );

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await createChapterVersion(client, {
          projectId: request.params.projectId,
          chapterId: request.params.chapterId,
          title: current.title,
          tone: current.tone,
          content: current.content,
          source: "regenerate-backup",
          style: "重生成前备份"
        });

        await client.query(
          `UPDATE chapters
           SET title = $1,
               goal = $2,
               conflict = $3,
               hook = $4,
               tone = $5,
               word_count = $6,
               selected_setting_ids = $7::jsonb,
               beats = $8::jsonb,
               content = $9,
               draft_title = $1,
               draft_tone = $5,
               draft_content = $9,
               draft_saved_at = $10,
               updated_at = $10
           WHERE id = $11 AND project_id = $12`,
          [
            nextTitle,
            nextGoal,
            nextConflict,
            nextHook,
            tone,
            nextWordCount,
            JSON.stringify(nextSelectedSettingIds),
            JSON.stringify(generated.beats),
            generated.content,
            savedAt,
            request.params.chapterId,
            request.params.projectId
          ]
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      await recordIoLog({
        projectId: request.params.projectId,
        chapterId: request.params.chapterId,
        workflow: "chapter_regenerate",
        stage: "persist",
        inputPayload: {
          title: titleInput,
          goal: nextGoal,
          conflict: nextConflict,
          hook: nextHook,
          tone,
          wordCount: nextWordCount,
          chapterNumber: chapter.number,
          selectedSettingIds: nextSelectedSettingIds
        },
        outputPayload: {
          chapterNumber: chapter.number,
          title: nextTitle,
          beats: generated.beats,
          selectedSettingIds: nextSelectedSettingIds,
          contract: generated.contract,
          plan: generated.plan,
          preflightGuard: generated.preflightGuard,
          postGuard: generated.postGuard,
          repaired: generated.repaired
        },
        outputText: generated.content
      });

      response.json({
        ...(await readData()),
        regeneratedChapterId: request.params.chapterId,
        generationWorkflow: {
          chapterId: request.params.chapterId,
          chapterNumber: chapter.number,
          title: nextTitle,
          contract: generated.contract,
          plan: generated.plan,
          preflightGuard: generated.preflightGuard,
          postGuard: generated.postGuard,
          repair: {
            applied: generated.repaired
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/projects/:projectId/chapters/workflow-preview/stream", async (request, response, next) => {
  let runtime = null;
  try {
    const project = await readProject(request.params.projectId);
    const chapter = request.body.chapterId ? findChapter(project, request.body.chapterId) : null;
    const workflow = chapter ? "chapter_regenerate_preview" : "chapter_preview";
    const tone = normalizeTone(request.body.tone, chapter?.tone || project.defaultTone);

    initSseResponse(response);
    runtime = createWorkflowRuntimeEmitter(response, {
      mode: "preview",
      workflow
    });
    runtime.start({
      chapterId: chapter?.id || "",
      chapterNumber: chapter?.number || computeNextChapterNumber(project)
    });

    const preview = await prepareChapterWorkflow(
      project,
      {
        ...request.body,
        workflow,
        title: chapter ? request.body.title?.trim() || chapter.title : request.body.title?.trim() || "",
        goal: chapter ? request.body.goal?.trim() || chapter.goal || "" : request.body.goal?.trim() || "",
        conflict: chapter ? request.body.conflict?.trim() || chapter.conflict || "" : request.body.conflict?.trim() || "",
        hook: chapter ? request.body.hook?.trim() || chapter.hook || "" : request.body.hook?.trim() || "",
        tone,
        wordCount: Number(request.body.wordCount || chapter?.wordCount || 1800),
        chapterNumber: chapter?.number,
        chapterId: chapter?.id || "",
        selectedSettingIds: request.body.selectedSettingIds ?? chapter?.selectedSettingIds ?? []
      },
      {
        workflow,
        plannerStage: "planner",
        guardStage: "guard_preflight",
        runtime
      }
    );

    runtime.done({
      ...(await readData()),
      workflowPreview: buildWorkflowPreviewPayload({
        chapterId: chapter?.id || "",
        chapterNumber: preview.chapterNumber,
        title: preview.title,
        input: preview.input,
        contract: preview.contract,
        plan: preview.plan,
        preflightGuard: preview.preflightGuard
      })
    });
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      next(error);
      return;
    }

    runtime?.error(error);
    response.end();
  }
});

app.post("/api/projects/:projectId/chapters/generate/stream", async (request, response, next) => {
  let runtime = null;
  try {
    const project = await readProject(request.params.projectId);
    const tone = normalizeTone(request.body.tone, project.defaultTone);
    const chapterNumber = computeNextChapterNumber(project);
    const chapterId = id("chapter");

    initSseResponse(response);
    runtime = createWorkflowRuntimeEmitter(response, {
      mode: "generate",
      workflow: "chapter_generate"
    });
    runtime.start({
      chapterId,
      chapterNumber
    });

    const generated = await generateChapter(
      project,
      {
        ...request.body,
        workflow: "chapter_generate",
        tone,
        chapterNumber,
        chapterId
      },
      {
        runtime
      }
    );

    const reviewInput = {
      title: request.body.title || "",
      goal: request.body.goal || "",
      conflict: request.body.conflict || "",
      hook: request.body.hook || "",
      tone,
      wordCount: Number(request.body.wordCount || 1800),
      selectedSettingIds: normalizeSelectedSettingIds(request.body.selectedSettingIds, project),
      constraintPolicy: request.body.constraintPolicy
    };

    runtime.stage("review_session", "running", {
      message: "正在整理审阅稿与待入库会话。"
    });
    const reviewSession = await createPendingGenerationReview({
      projectId: request.params.projectId,
      workflow: "chapter_generate",
      workflowChapterId: chapterId,
      inputPayload: reviewInput,
      generated,
      sessionType: "generate",
      targetMode: "next"
    });
    runtime.stage("review_session", "done", {
      message: "审阅稿已就位，可继续 commit / discard。",
      meta: {
        sessionId: reviewSession.sessionId
      }
    });
    runtime.snapshot({
      generationWorkflow: reviewSession.workflow
    });
    runtime.done({
      ...(await readData()),
      pendingGenerationSessionId: reviewSession.sessionId,
      generationWorkflow: reviewSession.workflow
    });
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      next(error);
      return;
    }

    runtime?.error(error);
    response.end();
  }
});

app.post(
  "/api/projects/:projectId/chapters/:chapterId/regenerate/stream",
  async (request, response, next) => {
    let runtime = null;
    try {
      const project = await readProject(request.params.projectId);
      const chapter = findChapter(project, request.params.chapterId);
      const current = getChapterEditorState(chapter, project);
      const tone = normalizeTone(request.body.tone, current.tone);
      const titleInput = request.body.title?.trim() || current.title;

      initSseResponse(response);
      runtime = createWorkflowRuntimeEmitter(response, {
        mode: "regenerate",
        workflow: "chapter_regenerate"
      });
      runtime.start({
        chapterId: chapter.id,
        chapterNumber: chapter.number
      });

      const generated = await generateChapter(
        project,
        {
          ...request.body,
          workflow: "chapter_regenerate",
          title: titleInput,
          goal: request.body.goal?.trim() || chapter.goal || "",
          conflict: request.body.conflict?.trim() || chapter.conflict || "",
          hook: request.body.hook?.trim() || chapter.hook || "",
          tone,
          wordCount: Number(request.body.wordCount || chapter.wordCount || 1800),
          chapterNumber: chapter.number,
          chapterId: chapter.id
        },
        {
          runtime
        }
      );

      const reviewInput = {
        title: titleInput,
        goal: request.body.goal?.trim() || chapter.goal || "",
        conflict: request.body.conflict?.trim() || chapter.conflict || "",
        hook: request.body.hook?.trim() || chapter.hook || "",
        tone,
        wordCount: Number(request.body.wordCount || chapter.wordCount || 1800),
        chapterNumber: chapter.number,
        selectedSettingIds: normalizeSelectedSettingIds(
          request.body.selectedSettingIds ?? chapter.selectedSettingIds,
          project
        ),
        constraintPolicy: request.body.constraintPolicy
      };

      runtime.stage("review_session", "running", {
        message: "正在整理重生成审阅稿与待入库会话。"
      });
      const reviewSession = await createPendingGenerationReview({
        projectId: request.params.projectId,
        workflow: "chapter_regenerate",
        ioChapterId: request.params.chapterId,
        sessionRecordChapterId: chapter.id,
        workflowChapterId: chapter.id,
        inputPayload: reviewInput,
        generated,
        sessionType: "regenerate",
        targetMode: "selected"
      });
      runtime.stage("review_session", "done", {
        message: "重生成审阅稿已就位，可继续 commit / discard。",
        meta: {
          sessionId: reviewSession.sessionId
        }
      });
      runtime.snapshot({
        generationWorkflow: reviewSession.workflow
      });
      runtime.done({
        ...(await readData()),
        pendingGenerationSessionId: reviewSession.sessionId,
        generationWorkflow: reviewSession.workflow
      });
      response.end();
    } catch (error) {
      if (!response.headersSent) {
        next(error);
        return;
      }

      runtime?.error(error);
      response.end();
    }
  }
);

app.post(
  "/api/projects/:projectId/generation-sessions/:sessionId/commit",
  async (request, response, next) => {
    try {
      const result = await commitGenerationSession(
        request.params.projectId,
        request.params.sessionId,
        {
          content: request.body.content
        }
      );

      await recordIoLog({
        projectId: request.params.projectId,
        chapterId: result.chapterId || "",
        workflow: result.mode === "regenerate" ? "chapter_regenerate" : "chapter_generate",
        stage: "review_commit",
        inputPayload: {
          sessionId: request.params.sessionId,
          hasManualContentOverride: request.body.content !== undefined
        },
        outputPayload: result.workflow,
        outputText: result.workflow?.repair?.reviewContent || ""
      });

      response.json({
        ...(await readData()),
        generationWorkflow: result.workflow,
        ...(result.mode === "regenerate"
          ? { regeneratedChapterId: result.chapterId }
          : { createdChapterId: result.chapterId })
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/projects/:projectId/generation-sessions/:sessionId/discard",
  async (request, response, next) => {
    try {
      await discardGenerationSession(request.params.projectId, request.params.sessionId);

      await recordIoLog({
        projectId: request.params.projectId,
        workflow: "generation_review",
        stage: "discard",
        inputPayload: {
          sessionId: request.params.sessionId
        }
      });

      response.json({
        ...(await readData()),
        discardedGenerationSessionId: request.params.sessionId
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/projects/:projectId/chapters/:chapterId/draft",
  async (request, response, next) => {
    try {
      const project = await readProject(request.params.projectId);
      const chapter = findChapter(project, request.params.chapterId);
      const current = getChapterEditorState(chapter, project);
      const savedAt = now();

      await pool.query(
        `UPDATE chapters
         SET draft_title = $1,
             draft_tone = $2,
             draft_content = $3,
             draft_saved_at = $4,
             updated_at = $4
         WHERE id = $5 AND project_id = $6`,
        [
          request.body.title?.trim() ?? current.title,
          normalizeTone(request.body.tone, current.tone),
          typeof request.body.content === "string" ? request.body.content : current.content,
          savedAt,
          request.params.chapterId,
          request.params.projectId
        ]
      );

      response.json(await readData());
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/projects/:projectId/chapters/:chapterId/save",
  async (request, response, next) => {
    try {
      const project = await readProject(request.params.projectId);
      const chapter = findChapter(project, request.params.chapterId);
      const current = getChapterEditorState(chapter, project);
      const savedAt = now();

      await pool.query(
        `UPDATE chapters
         SET title = $1,
             tone = $2,
             content = $3,
             draft_title = $1,
             draft_tone = $2,
             draft_content = $3,
             draft_saved_at = $4,
             updated_at = $4
         WHERE id = $5 AND project_id = $6`,
        [
          request.body.title?.trim() ?? current.title,
          normalizeTone(request.body.tone, current.tone),
          typeof request.body.content === "string" ? request.body.content : current.content,
          savedAt,
          request.params.chapterId,
          request.params.projectId
        ]
      );

      response.json(await readData());
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/projects/:projectId/chapters/:chapterId/rewrite-apply",
  async (request, response, next) => {
    try {
      const project = await readProject(request.params.projectId);
      const chapter = findChapter(project, request.params.chapterId);
      const current = getChapterEditorState(chapter, project);
      const nextContent = String(request.body.content || "").trim();

      if (!nextContent) {
        throw new Error("润色结果为空，无法覆盖章节");
      }

      const savedAt = now();
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        await createChapterVersion(client, {
          projectId: request.params.projectId,
          chapterId: request.params.chapterId,
          title: chapter.title,
          tone: chapter.tone,
          content: chapter.content,
          source: "overwrite-backup",
          style: request.body.style ? `覆盖前备份｜${request.body.style}` : "覆盖前备份"
        });

        await client.query(
          `UPDATE chapters
           SET title = $1,
               tone = $2,
               content = $3,
               draft_title = $1,
               draft_tone = $2,
               draft_content = $3,
               draft_saved_at = $4,
               updated_at = $4
           WHERE id = $5 AND project_id = $6`,
          [
            request.body.title?.trim() ?? current.title,
            normalizeTone(request.body.tone, current.tone),
            nextContent,
            savedAt,
            request.params.chapterId,
            request.params.projectId
          ]
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      response.json(await readData());
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/projects/:projectId/chapters/:chapterId/versions",
  async (request, response, next) => {
    try {
      const project = await readProject(request.params.projectId);
      const chapter = findChapter(project, request.params.chapterId);
      const current = getChapterEditorState(chapter, project);
      const content = String(request.body.content || "").trim();

      if (!content) {
        throw new Error("润色结果为空，无法另存版本");
      }

      const client = await pool.connect();
      try {
        await createChapterVersion(client, {
          projectId: request.params.projectId,
          chapterId: request.params.chapterId,
          title: request.body.title?.trim() ?? current.title,
          tone: normalizeTone(request.body.tone, current.tone),
          content,
          source: request.body.source || "rewrite",
          style: request.body.style || "润色版本"
        });
      } finally {
        client.release();
      }

      response.json(await readData());
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/projects/:projectId/chapters/workflow-preview", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const chapter = request.body.chapterId ? findChapter(project, request.body.chapterId) : null;
    const tone = normalizeTone(request.body.tone, chapter?.tone || project.defaultTone);
    const preview = await prepareChapterWorkflow(
      project,
      {
        ...request.body,
        workflow: chapter ? "chapter_regenerate_preview" : "chapter_preview",
        title: chapter ? request.body.title?.trim() || chapter.title : request.body.title?.trim() || "",
        goal: chapter ? request.body.goal?.trim() || chapter.goal || "" : request.body.goal?.trim() || "",
        conflict: chapter ? request.body.conflict?.trim() || chapter.conflict || "" : request.body.conflict?.trim() || "",
        hook: chapter ? request.body.hook?.trim() || chapter.hook || "" : request.body.hook?.trim() || "",
        tone,
        wordCount: Number(request.body.wordCount || chapter?.wordCount || 1800),
        chapterNumber: chapter?.number,
        chapterId: chapter?.id || "",
        selectedSettingIds: request.body.selectedSettingIds ?? chapter?.selectedSettingIds ?? []
      },
      {
        workflow: chapter ? "chapter_regenerate_preview" : "chapter_preview",
        plannerStage: "planner",
        guardStage: "guard_preflight"
      }
    );

    response.json({
      workflowPreview: {
        chapterId: chapter?.id || "",
        chapterNumber: preview.chapterNumber,
        title: preview.title,
        input: preview.input,
        contract: preview.contract,
        plan: preview.plan,
        preflightGuard: preview.preflightGuard
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/check", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const chapter = project.chapters.at(-1);

    if (!chapter) {
      throw new Error("还没有可检查的章节");
    }

    const report = analyzeChapter(project, chapter);
    await pool.query(
      `INSERT INTO reports (id, project_id, chapter_id, chapter_title, score, findings, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        report.id,
        request.params.projectId,
        report.chapterId,
        report.chapterTitle,
        report.score,
        JSON.stringify(report.findings),
        report.createdAt
      ]
    );

    if (project.chapters.length >= 5) {
      await pool.query(
        `UPDATE foreshadows
         SET warning = $1
         WHERE project_id = $2 AND status <> '已回收'`,
        ["已跨越多章未回收，建议安排一次提醒或小回收。", request.params.projectId]
      );
    }

    await recordIoLog({
      projectId: request.params.projectId,
      chapterId: report.chapterId,
      workflow: "chapter_check",
      stage: "latest",
      inputPayload: {
        chapterNumber: chapter.number,
        chapterTitle: chapter.title
      },
      outputPayload: report
    });

    response.json(await readData());
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/projects/:projectId/chapters/:chapterId/check",
  async (request, response, next) => {
    try {
      const project = await readProject(request.params.projectId);
      const chapter = findChapter(project, request.params.chapterId);
      const report = analyzeChapter(project, chapter);

      await pool.query(
        `INSERT INTO reports (id, project_id, chapter_id, chapter_title, score, findings, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          report.id,
          request.params.projectId,
          report.chapterId,
          report.chapterTitle,
          report.score,
          JSON.stringify(report.findings),
          report.createdAt
        ]
      );

      await recordIoLog({
        projectId: request.params.projectId,
        chapterId: report.chapterId,
        workflow: "chapter_check",
        stage: "single",
        inputPayload: {
          chapterNumber: chapter.number,
          chapterTitle: chapter.title
        },
        outputPayload: report
      });

      response.json(await readData());
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/projects/:projectId/rewrite", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const rewriteResult = await rewriteText(project, request.body);
    response.json({ ...(await readData()), rewriteResult });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/transform/stream", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    initSseResponse(response);

    const result = await streamTransformText(project, request.body, (delta, fullText = "") => {
      writeSseEvent(response, {
        type: "delta",
        delta,
        result: fullText
      });
    });

    writeSseEvent(response, {
      type: "done",
      result
    });
    response.end();
  } catch (error) {
    if (!response.headersSent) {
      next(error);
      return;
    }

    writeSseEvent(response, {
      type: "error",
      error: error.message || "请求失败"
    });
    response.end();
  }
});

app.post("/api/projects/:projectId/assist", async (request, response, next) => {
  try {
    const project = await readProject(request.params.projectId);
    const assistResult = await assistField(project, request.body);
    response.json({ ...(await readData()), assistResult });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const isDbConnectionError = ["ECONNREFUSED", "28P01", "3D000"].includes(error.code);
  const message = isDbConnectionError
    ? `PostgreSQL 连接失败：${error.message}。请确认 novel 数据库可连接，或在 .env 中配置 DATABASE_URL。`
    : error.message || "服务器错误";

  response.status(error.statusCode || 500).json({ error: message });
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`AI Novel Studio API running at http://localhost:${port}`);
      console.log(
        `PostgreSQL storage: ${databaseUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@")}`
      );
    });
  })
  .catch((error) => {
    console.error("Failed to initialize PostgreSQL storage.");
    console.error(error.message);
    process.exit(1);
  });
