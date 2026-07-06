export function makeWebDraftKey(projectId, scope) {
  return projectId ? `ai-novel:web-draft:${projectId}:${scope}` : "";
}
