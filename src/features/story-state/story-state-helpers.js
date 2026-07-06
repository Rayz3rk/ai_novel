export function mapStoryStateSourceLabel(source) {
  if (source === "generate_commit") return "生成入库";
  if (source === "regenerate_commit") return "重生成入库";
  if (source === "rewrite_apply") return "改写覆盖";
  if (source === "manual_save") return "手动保存";
  if (source === "backfill") return "补录";
  return "其他更新";
}

export function mapRelationshipKindLabel(kind) {
  if (kind === "alliance") return "结盟";
  if (kind === "tension") return "紧张";
  if (kind === "reveal") return "揭示";
  return "变化";
}

export function mapStoryHeatLabel(heat) {
  if (heat === "hot") return "高热";
  if (heat === "warm") return "升温";
  return "平稳";
}
