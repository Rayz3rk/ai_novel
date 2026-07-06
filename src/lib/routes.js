export function buildChapterEditorHash(projectId, chapterId, mode = "existing") {
  if (!projectId) return "";
  const params = new URLSearchParams({ projectId });
  if (chapterId) {
    params.set("chapterId", chapterId);
  }
  if (mode === "new") {
    params.set("mode", "new");
  }
  return `#/chapter-editor?${params.toString()}`;
}

export function buildSettingExtractorHash(projectId, chapterId = "") {
  if (!projectId) return "";
  const params = new URLSearchParams({ projectId });
  if (chapterId) {
    params.set("chapterId", chapterId);
  }
  return `#/setting-extractor?${params.toString()}`;
}

export function readChapterEditorRoute() {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#\/chapter-editor(?:\?(.*))?$/);
  if (!match) return null;

  const params = new URLSearchParams(match[1] || "");
  const projectId = params.get("projectId") || "";
  const chapterId = params.get("chapterId") || "";
  const mode = params.get("mode") === "new" ? "new" : "existing";

  if (!projectId) return null;
  if (mode === "new") return { projectId, chapterId: "", mode };
  if (!chapterId) return null;
  return { projectId, chapterId, mode };
}

export function readSettingExtractorRoute() {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#\/setting-extractor(?:\?(.*))?$/);
  if (!match) return null;

  const params = new URLSearchParams(match[1] || "");
  const projectId = params.get("projectId") || "";
  const chapterId = params.get("chapterId") || "";

  if (!projectId) return null;
  return { projectId, chapterId };
}
