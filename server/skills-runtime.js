import fs from "fs/promises";
import path from "path";
import JSZip from "jszip";

const SKILLS_ROOT = path.resolve(process.cwd(), "skills");
const SKILL_FILES = ["SKILL.md", "AGENTS.md", "CLAUDE.md"];
const PROMPT_MARKER_SET = new Set(SKILL_FILES);
const TEXT_SUPPORT_EXTENSIONS = new Set([".md", ".txt", ".yaml", ".yml", ".json"]);
const CACHE_TTL_MS = 15000;

let cachedCatalog = {
  expiresAt: 0,
  value: null
};

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function readFrontmatter(source) {
  const match = String(source || "").match(/^---\n([\s\S]*?)\n---\s*/);
  if (!match) return {};

  const lines = match[1].split("\n");
  const result = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    if (rawValue === "|" || rawValue === ">") {
      const buffer = [];
      let cursor = index + 1;
      while (cursor < lines.length && (/^\s+/.test(lines[cursor]) || lines[cursor] === "")) {
        buffer.push(lines[cursor].replace(/^\s{2}/, ""));
        cursor += 1;
      }
      result[key] = buffer.join("\n").trim();
      index = cursor - 1;
      continue;
    }

    result[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }

  return result;
}

function parseFrontmatterValue(source, key) {
  return String(readFrontmatter(source)?.[key] || "").trim();
}

function normalizeRelativeSkillPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.?\//, "");
}

function isTextSupportFile(relativePath) {
  const normalized = normalizeRelativeSkillPath(relativePath);
  const basename = path.posix.basename(normalized);
  if (PROMPT_MARKER_SET.has(basename)) return true;
  if (["plugin.json", "marketplace.json"].includes(basename)) return true;
  return TEXT_SUPPORT_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase());
}

function classifySupportFile(relativePath) {
  const normalized = normalizeRelativeSkillPath(relativePath);
  const basename = path.posix.basename(normalized);
  if (normalized.startsWith("references/")) return "reference";
  if (normalized.startsWith("agents/")) return "agent";
  if (/^\.claude-plugin\//.test(normalized) || ["plugin.json", "marketplace.json"].includes(basename)) {
    return "plugin";
  }
  if (/^readme(\.|$)/i.test(basename)) return "readme";
  return "support";
}

function truncateSupportContent(content, maxChars = 4000) {
  const text = normalizeText(content);
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text;
}

function buildSkillId(sourcePath) {
  return path
    .basename(sourcePath)
    .toLowerCase()
    .replace(/\.(zip|md)$/i, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isZhHeavyText(text) {
  const source = String(text || "");
  const matches = source.match(/[\u3400-\u9fff]/g) || [];
  return matches.length >= Math.max(12, source.length * 0.08);
}

function supportsHumanizeSkill(name, description, content, sourcePath) {
  const haystack = [name, description, content, sourcePath].join("\n").toLowerCase();
  return (
    /humaniz|去 ai|降 ai|ai 味|translationese|机械|翻译腔|母语表达/.test(haystack) &&
    /rewrite|edit|润色|改写|remove signs|去 ai 味/.test(haystack)
  );
}

function buildCompatibility(entryNames = []) {
  const names = new Set(entryNames);
  const compatibility = [];
  if (names.has("SKILL.md")) {
    compatibility.push("codex-skill", "claude-skill");
  }
  if (names.has("AGENTS.md")) {
    compatibility.push("codex-agents");
  }
  if (names.has("CLAUDE.md")) {
    compatibility.push("claude-memory");
  }
  return compatibility;
}

function buildSkillDescriptor({ sourcePath, sourceType, files }) {
  const promptEntry =
    files.find((item) => item.name === "SKILL.md") ||
    files.find((item) => item.name === "AGENTS.md") ||
    files.find((item) => item.name === "CLAUDE.md") ||
    null;

  if (!promptEntry) return null;

  const prompt = normalizeText(promptEntry.content);
  const name =
    parseFrontmatterValue(prompt, "name") ||
    path.basename(sourcePath).replace(/\.(zip|md)$/i, "") ||
    "skill";
  const description = parseFrontmatterValue(prompt, "description");
  const entryNames = files.map((item) => item.name);
  const compatibility = buildCompatibility(entryNames);
  const humanize = supportsHumanizeSkill(name, description, prompt, sourcePath);
  const supportFileContents = files
    .filter((item) => item !== promptEntry)
    .map((item) => ({
      path: normalizeRelativeSkillPath(item.relativePath || item.name),
      kind: classifySupportFile(item.relativePath || item.name),
      content: normalizeText(item.content)
    }));
  const supportFiles = supportFileContents.map(({ content, ...item }) => ({
    ...item,
    size: content.length
  }));
  const voiceOptions = supportFiles
    .filter((item) => /^references\/voices\/.+\.md$/i.test(item.path) && !/\/index\.md$/i.test(item.path))
    .map((item) => path.posix.basename(item.path, path.posix.extname(item.path)));

  return {
    id: buildSkillId(sourcePath),
    name,
    description,
    sourcePath,
    sourceType,
    promptFile: promptEntry.name,
    compatibility,
    isZh: isZhHeavyText(`${name}\n${description}\n${prompt}`),
    supportsHumanize: humanize,
    referenceCount: supportFiles.filter((item) => item.kind === "reference").length,
    supportFiles,
    voiceOptions,
    runtimePrompt: prompt,
    supportFileContents
  };
}

async function collectDirectoryFiles(sourcePath, currentPath = sourcePath) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectDirectoryFiles(sourcePath, entryPath)));
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = normalizeRelativeSkillPath(path.relative(sourcePath, entryPath));
    if (!isTextSupportFile(relativePath)) continue;

    files.push({
      name: path.basename(entryPath),
      relativePath,
      content: await fs.readFile(entryPath, "utf8")
    });
  }

  return files;
}

async function loadDirectorySkill(sourcePath) {
  const files = await collectDirectoryFiles(sourcePath);

  return buildSkillDescriptor({
    sourcePath,
    sourceType: "directory",
    files
  });
}

async function loadZipSkill(sourcePath) {
  const archive = await JSZip.loadAsync(await fs.readFile(sourcePath));
  const files = [];

  for (const file of Object.values(archive.files)) {
    if (file.dir) continue;
    const segments = normalizeRelativeSkillPath(file.name).split("/");
    const rootRelativePath = segments.slice(1).join("/") || segments[0];
    const shortName = path.posix.basename(rootRelativePath);
    if (!isTextSupportFile(rootRelativePath)) continue;
    files.push({
      name: shortName,
      relativePath: rootRelativePath,
      content: await file.async("string")
    });
  }

  return buildSkillDescriptor({
    sourcePath,
    sourceType: "zip",
    files
  });
}

async function scanSkillsRoot() {
  try {
    const entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });
    const descriptors = await Promise.all(
      entries.map(async (entry) => {
        const sourcePath = path.join(SKILLS_ROOT, entry.name);
        if (entry.isDirectory()) {
          return loadDirectorySkill(sourcePath);
        }
        if (entry.isFile() && /\.zip$/i.test(entry.name)) {
          return loadZipSkill(sourcePath);
        }
        return null;
      })
    );

    return descriptors
      .filter(Boolean)
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function readSkillCatalog() {
  const now = Date.now();
  if (cachedCatalog.value && cachedCatalog.expiresAt > now) {
    return cachedCatalog.value;
  }

  const catalog = await scanSkillsRoot();
  cachedCatalog = {
    value: catalog,
    expiresAt: now + CACHE_TTL_MS
  };
  return catalog;
}

export function serializeSkillCatalog(catalog = []) {
  return (Array.isArray(catalog) ? catalog : []).map(
    ({ runtimePrompt, supportFileContents, ...skill }) => skill
  );
}

export function pickHumanizerSkill(catalog = [], text = "", preferredSkillId = "") {
  const skills = Array.isArray(catalog) ? catalog.filter((item) => item.supportsHumanize) : [];
  if (!skills.length) return null;

  const preferred = skills.find((item) => item.id === preferredSkillId);
  if (preferred) return preferred;

  const wantsZh = isZhHeavyText(text);
  return (
    skills.find((item) => item.isZh === wantsZh) ||
    skills.find((item) => item.isZh) ||
    skills[0]
  );
}

export function getHumanizeMode(text = "") {
  return isZhHeavyText(text) ? "zh" : "en";
}

export function buildHumanizerSkillPrompt(skill, { mode = "zh", pipeline = "transform_final" } = {}) {
  if (!skill) return "";

  const parts = [skill.runtimePrompt];
  const supportFiles = Array.isArray(skill.supportFileContents) ? skill.supportFileContents : [];
  const selected = [];

  if (mode === "zh") {
    for (const wantedPath of [
      "references/patterns.md",
      "references/corpus-quickpick.md",
      "agents/openai.yaml"
    ]) {
      const match = supportFiles.find((item) => item.path === wantedPath);
      if (match) selected.push(match);
    }
    if (pipeline === "transform_final") {
      const voiceIndex = supportFiles.find((item) => item.path === "references/voices/index.md");
      if (voiceIndex) selected.push(voiceIndex);
    }
  } else {
    const providerHint = supportFiles.find((item) => item.path === "agents/openai.yaml");
    if (providerHint) selected.push(providerHint);
  }

  if (!selected.length) return parts.join("\n\n");

  parts.push(
    selected
      .map(
        (item) =>
          `Supplemental ${item.kind} (${item.path}):\n${truncateSupportContent(
            item.content,
            item.path.includes("patterns.md") ? 5000 : 2400
          )}`
      )
      .join("\n\n")
  );

  return parts.join("\n\n");
}

export function applyLocalHumanizer(text = "", mode = "zh") {
  let result = normalizeText(text);
  if (!result) return "";

  if (mode === "zh") {
    result = result
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/——/g, "，")
      .replace(/这意味着/gu, "这也说明")
      .replace(/值得注意的是/gu, "")
      .replace(/从某种意义上说/gu, "")
      .replace(/与此同时/gu, "同时")
      .replace(/不是([^，。；！？\n]{1,20})而是/gu, "更像是$1，也不是简单地")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
    return result.trim();
  }

  result = result
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, ",")
    .replace(/\b(additionally|moreover)\b,?\s*/giu, "")
    .replace(/\blet's dive in\b[:,]?\s*/giu, "")
    .replace(/\bit is important to note that\b\s*/giu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return result.trim();
}
