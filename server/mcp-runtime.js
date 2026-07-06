import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const SETTINGS_DIR = path.resolve(process.cwd(), "settings");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "mcp-servers.json");
const PROTOCOL_VERSION = "2025-11-25";
const CLIENT_INFO = {
  name: "ai-novel-studio",
  version: "0.1.0"
};
const CACHE_TTL_MS = 15000;
const DEFAULT_TIMEOUT_MS = 15000;

let cachedState = {
  expiresAt: 0,
  value: null
};

const IS_WINDOWS = process.platform === "win32";

function nowMs() {
  return Date.now();
}

function normalizeString(value, fallback = "") {
  const next = String(value ?? "").trim();
  return next || fallback;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "")).filter((item) => item.length > 0);
}

function normalizeEnvMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [String(key).trim(), String(item ?? "")])
      .filter(([key]) => key)
  );
}

function buildServerId(name, command, index = 0) {
  const seed = `${name || command || "mcp"}-${index}`;
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveCommandForSpawn(command) {
  const normalized = normalizeString(command);
  if (!normalized || !IS_WINDOWS) return normalized;
  if (path.extname(normalized)) return normalized;
  return `${normalized}.cmd`;
}

function sanitizeMcpServerInput(input = {}, index = 0) {
  const name = normalizeString(input.name, `MCP Server ${index + 1}`);
  const command = normalizeString(input.command);
  return {
    id: normalizeString(input.id, buildServerId(name, command, index)),
    name,
    command,
    args: normalizeStringArray(input.args),
    cwd: normalizeString(input.cwd),
    enabled: input.enabled !== false,
    env: normalizeEnvMap(input.env)
  };
}

async function ensureSettingsDir() {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
}

async function readSettingsFile() {
  try {
    return JSON.parse(await fs.readFile(SETTINGS_FILE, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { servers: [] };
    }
    throw error;
  }
}

export async function readMcpServerConfig() {
  const data = await readSettingsFile();
  const servers = Array.isArray(data?.servers)
    ? data.servers.map((item, index) => sanitizeMcpServerInput(item, index))
    : [];
  return { servers };
}

export async function saveMcpServerConfig(input = {}) {
  await ensureSettingsDir();
  const servers = Array.isArray(input?.servers)
    ? input.servers
        .map((item, index) => sanitizeMcpServerInput(item, index))
        .filter((item) => item.command)
    : [];
  await fs.writeFile(SETTINGS_FILE, JSON.stringify({ servers }, null, 2), "utf8");
  cachedState = { expiresAt: 0, value: null };
  return { servers };
}

function createRpcTransport(child, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let nextId = 1;
  let buffer = "";
  const pending = new Map();

  function cleanupPending(error) {
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(error);
    }
    pending.clear();
  }

  function handleMessage(payload) {
    if (!payload || typeof payload !== "object") return;
    if (Object.prototype.hasOwnProperty.call(payload, "id") && pending.has(payload.id)) {
      const entry = pending.get(payload.id);
      pending.delete(payload.id);
      clearTimeout(entry.timeout);
      if (payload.error) {
        entry.reject(new Error(payload.error.message || "MCP request failed"));
        return;
      }
      entry.resolve(payload.result);
    }
  }

  child.stdout.on("data", (chunk) => {
    buffer += String(chunk || "");
    let boundary = buffer.indexOf("\n");
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 1);
      if (line) {
        try {
          handleMessage(JSON.parse(line));
        } catch (_error) {
          // Ignore malformed output lines and continue reading.
        }
      }
      boundary = buffer.indexOf("\n");
    }
  });

  child.on("error", (error) => cleanupPending(error));
  child.on("exit", (code, signal) => {
    cleanupPending(new Error(`MCP process exited (${code ?? "null"}${signal ? ` / ${signal}` : ""})`));
  });

  return {
    request(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`MCP request timed out: ${method}`));
        }, timeoutMs);

        pending.set(id, { resolve, reject, timeout });
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params
          })}\n`
        );
      });
    },
    notify(method, params = {}) {
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          method,
          params
        })}\n`
      );
    }
  };
}

async function withMcpClient(server, work) {
  const child = spawn(resolveCommandForSpawn(server.command), server.args, {
    cwd: server.cwd || process.cwd(),
    env: {
      ...process.env,
      ...server.env
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk || "");
  });

  const transport = createRpcTransport(child);

  try {
    const init = await transport.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO
    });
    transport.notify("notifications/initialized", {});
    return await work({
      request: transport.request,
      notify: transport.notify,
      init,
      stderr: () => stderr.trim()
    });
  } finally {
    child.kill();
  }
}

async function listAllPages(request, method, arrayKey) {
  const items = [];
  let cursor = undefined;
  let pageCount = 0;

  while (pageCount < 10) {
    const result = await request(method, cursor ? { cursor } : {});
    const pageItems = Array.isArray(result?.[arrayKey]) ? result[arrayKey] : [];
    items.push(...pageItems);
    if (!result?.nextCursor) break;
    cursor = result.nextCursor;
    pageCount += 1;
  }

  return items;
}

async function inspectServer(server) {
  if (!server.enabled) {
    return {
      ...server,
      status: "disabled",
      protocolVersion: "",
      capabilities: {},
      tools: [],
      resources: [],
      prompts: [],
      error: ""
    };
  }

  try {
    return await withMcpClient(server, async ({ request, init, stderr }) => {
      const [tools, resources, prompts] = await Promise.all([
        listAllPages(request, "tools/list", "tools").catch(() => []),
        listAllPages(request, "resources/list", "resources").catch(() => []),
        listAllPages(request, "prompts/list", "prompts").catch(() => [])
      ]);

      return {
        ...server,
        status: "ready",
        protocolVersion: init?.protocolVersion || "",
        capabilities: init?.capabilities || {},
        tools,
        resources,
        prompts,
        stderr: stderr(),
        error: ""
      };
    });
  } catch (error) {
    return {
      ...server,
      status: "error",
      protocolVersion: "",
      capabilities: {},
      tools: [],
      resources: [],
      prompts: [],
      error: error.message || "MCP inspection failed"
    };
  }
}

function summarizeTool(tool, serverId, serverName) {
  return {
    serverId,
    serverName,
    name: tool?.name || "",
    description: tool?.description || "",
    inputSchema: tool?.inputSchema || tool?.parameters || {}
  };
}

function summarizeResource(resource, serverId, serverName) {
  return {
    serverId,
    serverName,
    name: resource?.name || "",
    uri: resource?.uri || "",
    description: resource?.description || "",
    mimeType: resource?.mimeType || ""
  };
}

function summarizePrompt(prompt, serverId, serverName) {
  return {
    serverId,
    serverName,
    name: prompt?.name || "",
    description: prompt?.description || "",
    arguments: Array.isArray(prompt?.arguments) ? prompt.arguments : []
  };
}

export async function readMcpRuntimeState({ forceRefresh = false } = {}) {
  const now = nowMs();
  if (!forceRefresh && cachedState.value && cachedState.expiresAt > now) {
    return cachedState.value;
  }

  const config = await readMcpServerConfig();
  const servers = await Promise.all(config.servers.map((server) => inspectServer(server)));
  const tools = servers.flatMap((server) =>
    (server.tools || []).map((tool) => summarizeTool(tool, server.id, server.name))
  );
  const resources = servers.flatMap((server) =>
    (server.resources || []).map((resource) => summarizeResource(resource, server.id, server.name))
  );
  const prompts = servers.flatMap((server) =>
    (server.prompts || []).map((prompt) => summarizePrompt(prompt, server.id, server.name))
  );

  const state = {
    servers,
    tools,
    resources,
    prompts
  };
  cachedState = {
    value: state,
    expiresAt: now + CACHE_TTL_MS
  };
  return state;
}

export async function callMcpTool({ serverId = "", toolName = "", arguments: toolArgs = {} } = {}) {
  const config = await readMcpServerConfig();
  const server = config.servers.find((item) => item.id === serverId);

  if (!server) {
    throw new Error("MCP server not found");
  }
  if (!server.enabled) {
    throw new Error("Selected MCP server is disabled");
  }
  if (!toolName) {
    throw new Error("Tool name is required");
  }

  return withMcpClient(server, async ({ request, stderr }) => {
    const result = await request("tools/call", {
      name: toolName,
      arguments: toolArgs && typeof toolArgs === "object" ? toolArgs : {}
    });
    return {
      serverId: server.id,
      serverName: server.name,
      toolName,
      result,
      stderr: stderr()
    };
  });
}
