function joinBlocks(blocks) {
  return blocks.filter((item) => String(item || "").trim()).join("\n\n");
}

function previewText(text, limit = 180) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "暂无正文";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function summarizeRecentChapters(chapters, limit = 3) {
  if (!chapters?.length) return "暂无已完成章节。";
  return chapters
    .slice(-limit)
    .map((chapter) =>
      [
        `第 ${chapter.number} 章 ${chapter.title}`,
        chapter.goal ? `目标：${chapter.goal}` : "",
        chapter.conflict ? `冲突：${chapter.conflict}` : "",
        chapter.hook ? `收束线索：${chapter.hook}` : "",
        `正文摘要：${previewText(chapter.content)}`
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function summarizeChapterContract(contract) {
  if (!contract) return "暂无额外硬约束。";

  return [
    contract.chapterLock ? `章节锁定：${contract.chapterLock}` : "",
    contract.titleLock ? `标题锁定：${contract.titleLock}` : "",
    contract.coreMission ? `本章任务：${contract.coreMission}` : "",
    contract.conflictAnchor ? `冲突锚点：${contract.conflictAnchor}` : "",
    contract.endingRequirement ? `收束要求：${contract.endingRequirement}` : "",
    contract.mustUseSettings?.length
      ? `必须直接调用的设定：${contract.mustUseSettings.join("；")}`
      : "",
    contract.mustMention?.length ? `必须照应的信息：${contract.mustMention.join("；")}` : "",
    contract.continuity?.length ? `连续性约束：${contract.continuity.join("；")}` : "",
    contract.forbidden?.length ? `禁止漂移：${contract.forbidden.join("；")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeConstraintLayers(layers) {
  if (!layers) return "暂无分层约束。";

  const policy = layers.policy || {};
  const enabledPolicies = [
    policy.strictWorldRules ? "锁世界规则" : "",
    policy.lockCharacterMotivations ? "锁人物动机" : "",
    policy.enforceForeshadowContinuity ? "锁伏笔照应" : "",
    policy.lockRecentContinuity ? "锁最近连续性" : ""
  ].filter(Boolean);

  return [
    enabledPolicies.length ? `策略：${enabledPolicies.join("｜")}` : "",
    layers.chapterIdentity?.length ? `章节身份层：${layers.chapterIdentity.join("；")}` : "",
    layers.characterMotivations?.length ? `人物动机层：${layers.characterMotivations.join("；")}` : "",
    layers.worldRules?.length ? `世界规则层：${layers.worldRules.join("；")}` : "",
    layers.continuityAnchors?.length ? `连续性层：${layers.continuityAnchors.join("；")}` : "",
    layers.foreshadowAnchors?.length ? `伏笔层：${layers.foreshadowAnchors.join("；")}` : "",
    layers.hardBans?.length ? `硬禁止层：${layers.hardBans.join("；")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export const agentWorkflowConfig = {
  chapterGeneration: {
    stages: [
      { id: "planner", label: "章节策划" },
      { id: "guard_preflight", label: "预写作 Guard" },
      { id: "writer", label: "章节写作" },
      { id: "guard", label: "后置 Guard" },
      { id: "repair", label: "最小修订" }
    ],
    configFile: "server/ai-config.js"
  }
};

export function buildChapterPlannerMessages({
  project,
  settingsSummary,
  chapterNumber,
  title,
  input,
  contract
}) {
  const stageGoal = input.goal?.trim() || `推进《${project.title}》当前叙事`;
  const stageConflict = input.conflict?.trim() || "未显式指定";
  const stageHook = input.hook?.trim();
  const displayTitle = title === `第 ${chapterNumber} 章` ? "未命名小标题" : title;

  return [
    {
      role: "system",
      content: [
        "你是中文小说创作流程里的“章节策划”智能体，只负责给写作智能体产出可执行 brief。",
        "只返回合法 JSON，不要 Markdown，不要解释。",
        "先满足章节契约里的硬约束，再决定这一章是否需要强冲突、反转或钩子。",
        "不要把每一章都硬套成固定的起承转合。",
        "只有当前章节任务确实需要时，才安排强冲突升级、反转或结尾钩子。",
        "如果用户没有提供结尾钩子，允许本章自然收束。",
        "章节序号必须锁定，绝不能漂移成别的章节。",
        'JSON schema: {"narrativeMode":"推进|铺垫|转场|爆发|揭示|关系拉扯|混合","summary":"一句话概括本章任务","beats":["3到6条可执行节拍"],"mustKeep":["必须保留的设定或信息点"],"mustMention":["本章必须照应的人物/信息"],"mustUseSettings":["必须直接调用的设定"],"continuity":["必须承接的上文状态"],"forbidden":["不能发生的漂移或越界"],"endingMode":"natural|open|hook","endingNote":"结尾如何收束"}'
      ].join("\n")
    },
    {
      role: "user",
      content: joinBlocks([
        `书名：${project.title}`,
        `类型：${project.genre}`,
        `核心卖点：${project.premise}`,
        `章节序号：第 ${chapterNumber} 章`,
        `章节标题：${displayTitle}`,
        `章节目标：${stageGoal}`,
        `核心冲突：${stageConflict}`,
        `章节语气：${input.tone}`,
        `目标字数：${input.wordCount}`,
        stageHook ? `期望结尾钩子：${stageHook}` : "期望结尾钩子：无，允许自然收束",
        `章节契约：\n${summarizeChapterContract(contract)}`,
        `约束分层：\n${summarizeConstraintLayers(contract?.constraintLayers)}`,
        `设定库：\n${settingsSummary || "暂无设定"}`,
        `最近章节：\n${summarizeRecentChapters(project.chapters)}`,
        "请输出一个足够具体、但不要僵硬模板化的章节 brief。"
      ])
    }
  ];
}

export function buildChapterWriterMessages({
  project,
  settingsSummary,
  chapterNumber,
  title,
  input,
  plan,
  contract,
  headingLine
}) {
  const displayTitle = title === `第 ${chapterNumber} 章` ? "未命名小标题" : title;

  return [
    {
      role: "system",
      content: [
        "你是中文长篇小说创作流程里的“章节写作”智能体。",
        "你要根据策划 brief 写出可直接入库的章节正文。",
        "先满足章节契约和策划 brief 的硬约束，再考虑文采；若两者冲突，以章节契约为准。",
        "只输出正文，不要解释，不要列提纲，不要写“本章基调”“节拍”等提示语。",
        `正文首行必须严格写成：${headingLine}`,
        "严禁把章节序号写成其他章。",
        "不要为了形式感强行补齐冲突爆发、中段升级、反转和结尾钩子。",
        "允许写成铺垫章、过渡章、情绪章、信息章、爆发章，只要符合当前任务。",
        "若用户没有提供结尾钩子，可自然收束在情绪、结果或新的门槛上。",
        "必须遵守设定库、既有角色动机和世界规则，不能自创会破坏连续性的事实。",
        "章节契约里的“约束分层”优先级高于自由发挥：先守住章节身份、人物动机、世界规则、连续性和伏笔，再写文气。"
      ].join("\n")
    },
    {
      role: "user",
      content: joinBlocks([
        `书名：${project.title}`,
        `类型：${project.genre}`,
        `核心卖点：${project.premise}`,
        `章节序号：第 ${chapterNumber} 章`,
        `章节标题：${displayTitle}`,
        `章节语气：${input.tone}`,
        `目标字数：${input.wordCount}`,
        `章节契约：\n${summarizeChapterContract(contract)}`,
        `约束分层：\n${summarizeConstraintLayers(contract?.constraintLayers)}`,
        `设定库：\n${settingsSummary || "暂无设定"}`,
        `最近章节：\n${summarizeRecentChapters(project.chapters)}`,
        `策划 brief：\n${JSON.stringify(plan, null, 2)}`,
        "请直接写完整章节正文。"
      ])
    }
  ];
}

export function buildChapterGuardMessages({
  project,
  settingsSummary,
  chapterNumber,
  title,
  input,
  contract,
  plan,
  content = "",
  phase = "postwrite",
  headingLine
}) {
  const displayTitle = title === `第 ${chapterNumber} 章` ? "未命名小标题" : title;

  return [
    {
      role: "system",
      content: [
        "你是中文小说创作流程里的“guard / continuity editor”智能体。",
        "你的职责是审查章节契约、章节 brief 和正文是否存在设定冲突、人物动机漂移、伏笔漏接、章节号/标题漂移、结尾收束失真等问题。",
        "只返回合法 JSON，不要 Markdown，不要解释。",
        phase === "preflight"
          ? "当前是正文生成前审查，只检查 contract 和 brief 是否足够稳。"
          : "当前是正文生成后审查，要指出正文中最需要最小修补的问题。",
        "优先沿着章节身份、人物动机、世界规则、连续性和伏笔这几个约束层查问题。",
        'JSON schema: {"status":"pass|needs_fix|block","score":0,"findings":[{"severity":"high|medium|low","type":"setting_conflict|motivation_drift|foreshadow_miss|continuity|chapter_drift|ending","target":"contract|plan|content","title":"问题短名","detail":"具体问题","suggestion":"最小修改建议"}],"suggestedContractPatch":{"mustMention":["可选"],"continuity":["可选"],"forbidden":["可选"]},"suggestedPlanPatch":{"beats":["可选"],"mustKeep":["可选"],"endingNote":"可选"},"repairPlan":["如果正文需要修补，这里给 1 到 4 条最小修订动作"]}'
      ].join("\n")
    },
    {
      role: "user",
      content: joinBlocks([
        `书名：${project.title}`,
        `类型：${project.genre}`,
        `章节序号：第 ${chapterNumber} 章`,
        `章节标题：${displayTitle}`,
        `正文首行要求：${headingLine}`,
        `章节语气：${input.tone}`,
        `目标字数：${input.wordCount}`,
        `阶段：${phase === "preflight" ? "正文生成前审查" : "正文生成后审查"}`,
        `设定库：\n${settingsSummary || "暂无设定"}`,
        `章节契约：\n${summarizeChapterContract(contract)}`,
        `约束分层：\n${summarizeConstraintLayers(contract?.constraintLayers)}`,
        `策划 brief：\n${JSON.stringify(plan, null, 2)}`,
        content ? `正文：\n${content}` : "正文：当前尚未生成，请只审查约束链是否完整稳定。"
      ])
    }
  ];
}

export function buildChapterRepairMessages({
  project,
  settingsSummary,
  chapterNumber,
  title,
  input,
  contract,
  plan,
  guardReport,
  content,
  headingLine
}) {
  const displayTitle = title === `第 ${chapterNumber} 章` ? "未命名小标题" : title;

  return [
    {
      role: "system",
      content: [
        "你是中文小说修订编辑。",
        "你会根据 guard 报告对正文做最小必要修订。",
        "优先修正设定冲突、人物动机漂移、伏笔漏接、章节号/标题错误和结尾收束问题。",
        "只做必要的局部改动，不要整章重写，不要改变已经成立的主要剧情事实。",
        "修订时优先守住约束分层，尽量以最小补丁方式修正文中最危险的漂移点。",
        `正文首行必须严格写成：${headingLine}`,
        "只输出修订后的完整正文，不要解释，不要加标题说明。"
      ].join("\n")
    },
    {
      role: "user",
      content: joinBlocks([
        `书名：${project.title}`,
        `类型：${project.genre}`,
        `章节序号：第 ${chapterNumber} 章`,
        `章节标题：${displayTitle}`,
        `章节语气：${input.tone}`,
        `设定库：\n${settingsSummary || "暂无设定"}`,
        `章节契约：\n${summarizeChapterContract(contract)}`,
        `约束分层：\n${summarizeConstraintLayers(contract?.constraintLayers)}`,
        `策划 brief：\n${JSON.stringify(plan, null, 2)}`,
        `guard 报告：\n${JSON.stringify(guardReport, null, 2)}`,
        `待修订正文：\n${content}`
      ])
    }
  ];
}

export function buildTransformMessages({ project, settingsSummary, input }) {
  const mode = input.mode === "modify" ? "modify" : "polish";

  return [
    {
      role: "system",
      content: [
        "你是中文小说编辑。",
        mode === "modify"
          ? "你要严格按照修改要求动刀，只输出修改后的正文，不要解释。"
          : "你要按抽象风格方向润色，不模仿具体作者，只输出润色后的正文。",
        "优先保留事实、人物关系、世界规则和已建立的叙事逻辑。",
        input.rewriteScope === "selection"
          ? "当前输入是局部片段，只返回修改后的片段，不要补写整章。"
          : "当前输入是完整待处理文本，只返回处理后的全文。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `书名：${project.title}`,
        `类型：${project.genre}`,
        `创作台语气：${project.defaultTone}`,
        `章节语气：${input.tone}`,
        mode === "modify"
          ? `修改要求：${input.instruction || "在不破坏设定的前提下完成修改"}`
          : `改写方向：${input.style}`,
        mode === "modify"
          ? "执行原则：只改动修改要求明确涉及的部分；未要求改动的事实、人物关系和设定尽量保持不变。"
          : "执行原则：保留事实、人物关系和设定限制，只调整表达、节奏和气质。",
        `设定库：\n${settingsSummary || "暂无设定"}`,
        "",
        `原文：\n${input.source}`
      ].join("\n")
    }
  ];
}

export function buildRewriteMessages({ project, settingsSummary, input }) {
  return buildTransformMessages({
    project,
    settingsSummary,
    input: {
      ...input,
      mode: "polish"
    }
  });
}

export function buildSettingExtractionMessages({ project, settingsSummary, input }) {
  return [
    {
      role: "system",
      content: [
        "你是中文小说设定编辑，只负责从文本里提取适合进入设定库的稳定设定。",
        "优先提取角色、世界观、地点、道具、能力体系。",
        "不要把一次性动作、临时情绪或普通叙事句硬拆成设定。",
        "如果和已有设定库明显重复，优先合并表达，不要重复造条目。",
        "只返回合法 JSON，不要 Markdown，不要解释。",
        'JSON schema: {"items":[{"type":"character|world|location|item|power","name":"设定名","summary":"适合直接入库的核心设定","traits":"可选，逗号分隔的短标签","rules":"可选，明确限制或规则","evidence":"从原文提取的短依据"}]}'
      ].join("\n")
    },
    {
      role: "user",
      content: joinBlocks([
        `书名：${project.title}`,
        `类型：${project.genre}`,
        `创作台语气：${project.defaultTone}`,
        input.chapterTitle
          ? `来源章节：第 ${input.chapterNumber || "?"} 章 ${input.chapterTitle}`
          : `来源类型：${input.sourceMode === "chapter" ? "已有章节" : "外部文本"}`,
        `已有设定库：\n${settingsSummary || "暂无设定"}`,
        "请提取 3 到 8 条最值得入库的设定；如果文本里信息不足，可以少于 3 条。",
        `待提取文本：\n${input.source}`
      ])
    }
  ];
}

export function buildAssistMessages({
  project,
  settingsSummary,
  input,
  fieldLabel,
  fallbackValue
}) {
  return [
    {
      role: "system",
      content:
        "你是中文小说创作协作助手。只返回可以直接填入表单输入框的文本，不要解释，不要加标题，不要输出 Markdown。"
    },
    {
      role: "user",
      content: [
        `书名：${project.title}`,
        `类型：${project.genre}`,
        `创作台语气：${project.defaultTone}`,
        `设定库：\n${settingsSummary || "暂无设定"}`,
        `当前字段：${fieldLabel}`,
        `当前内容：${input.source?.trim() || fallbackValue}`,
        `操作：${input.mode === "polish" ? "润色压缩" : "扩写补全"}`,
        input.guidance ? `额外要求：${input.guidance}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    }
  ];
}
