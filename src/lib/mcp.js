import { makeClientId } from "./project-helpers.js";

export function buildMcpServerDraft(server = null) {
  return {
    id: server?.id || makeClientId("mcp"),
    name: server?.name || "",
    command: server?.command || "",
    args: Array.isArray(server?.args) ? server.args.join(" ") : "",
    cwd: server?.cwd || "",
    enabled: server?.enabled !== false,
    envText: server?.env ? JSON.stringify(server.env, null, 2) : "{}"
  };
}

export function parseMcpArgs(value) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseJsonDraft(value, fallbackValue) {
  try {
    const parsed = JSON.parse(String(value || "").trim() || JSON.stringify(fallbackValue));
    return parsed && typeof parsed === "object" ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
}
