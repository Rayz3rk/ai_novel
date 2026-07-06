export function formatTime(value) {
  if (!value) return "未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未保存";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function extensionForFormat(format) {
  return format === "markdown" ? "md" : format;
}

export function buildDownloadName(baseName, format) {
  return `${baseName || "download"}.${extensionForFormat(format)}`;
}

export function summarizeInlineText(text, limit = 88) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "暂无内容";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

export function countTextUnits(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

export function summarizeInstruction(value, limit = 24) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "未填写指令";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

export function formatJsonBlock(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}
