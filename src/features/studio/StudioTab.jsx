import React from "react";
import {
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Edit3,
  Gauge,
  GitBranch,
  Plus,
  Sparkles,
  Target,
  Wand2
} from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import { ReportCard, PlotMap, StoryStateOverview } from "../story-state/StoryStatePanels.jsx";
import { ProjectTonePanel } from "./ProjectTonePanel.jsx";

export function StudioTab({
  project,
  request,
  mutate,
  streamEvents,
  working,
  setActiveTab,
  skills = [],
  mcp = {},
  ChapterGenerator,
  formatTime,
  summarizeInlineText,
  mapStoryStateSourceLabel,
  mapStoryHeatLabel,
  mapRelationshipKindLabel
}) {
  const latestReport = project.reports[0];
  const chapterCount = project.chapters.length;
  const unresolvedThreads = project.foreshadows.filter((item) => item.status !== "已回收").length;
  const characterCount = project.settings.filter((item) => item.type === "character").length;
  const ioLogCount = project.ioLogs?.length || 0;
  const stateSummary = project.storyStateSummary || {};
  const activeStateCount = stateSummary.activeEntities?.length || 0;
  const carryoverCount = stateSummary.carryovers?.length || 0;

  return (
    <section className="content-grid studio-grid">
      <div className="quick-actions">
        <button onClick={() => setActiveTab("chapters")}>
          <Sparkles size={17} />
          章节库
        </button>
        <button onClick={() => setActiveTab("bible")}>
          <Plus size={17} />
          设定集
        </button>
        <button onClick={() => setActiveTab("threads")}>
          <GitBranch size={17} />
          伏笔线程
        </button>
        <button onClick={() => setActiveTab("rewrite")}>
          <Wand2 size={17} />
          改写 / 润色
        </button>
        <button onClick={() => setActiveTab("state")}>
          <Clock3 size={17} />
          故事状态
        </button>
        <button onClick={() => setActiveTab("io")}>
          <BrainCircuit size={17} />
          I/O 记录
        </button>
      </div>

      <div className="overview-band">
        <div className="metric"><span>章节数</span><strong>{chapterCount}</strong></div>
        <div className="metric"><span>设定资产</span><strong>{project.settings.length}</strong></div>
        <div className="metric"><span>角色数</span><strong>{characterCount}</strong></div>
        <div className="metric"><span>未回收伏笔</span><strong>{unresolvedThreads}</strong></div>
        <div className="metric"><span>活跃状态</span><strong>{activeStateCount}</strong></div>
        <div className="metric"><span>待承接事项</span><strong>{carryoverCount}</strong></div>
        <div className="metric"><span>I/O 记录</span><strong>{ioLogCount}</strong></div>
      </div>

      <div className="panel chapter-engine-panel wide">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Chapter Cockpit</p>
            <h2>章节驾驶舱</h2>
          </div>
          <Edit3 size={20} />
        </div>
        <ChapterGenerator
          project={project}
          request={request}
          mutate={mutate}
          streamEvents={streamEvents}
          working={working}
          mcp={mcp}
          compact
        />
      </div>

      <div className="studio-main-column">
        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Story State</p>
              <h2>当前故事状态</h2>
            </div>
            <Clock3 size={20} />
          </div>
          <StoryStateOverview
            project={project}
            compact
            formatTime={formatTime}
            summarizeInlineText={summarizeInlineText}
            mapStoryStateSourceLabel={mapStoryStateSourceLabel}
            mapStoryHeatLabel={mapStoryHeatLabel}
            mapRelationshipKindLabel={mapRelationshipKindLabel}
          />
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Plot Map</p>
              <h2>章节地图</h2>
            </div>
            <GitBranch size={20} />
          </div>
          <PlotMap project={project} />
        </div>
      </div>

      <div className="studio-side-column">
        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Project Tone</p>
              <h2>项目语气</h2>
            </div>
            <Gauge size={20} />
          </div>
          <ProjectTonePanel project={project} mutate={mutate} working={working} skills={skills} />
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Risk Radar</p>
              <h2>风险雷达</h2>
            </div>
            <Target size={20} />
          </div>
          {latestReport ? <ReportCard report={latestReport} /> : <EmptyState text="还没有章节审阅报告。" />}
          <button
            className="secondary-button full"
            disabled={!project.chapters.length || Boolean(working)}
            onClick={() => mutate(`/api/projects/${project.id}/check`, {}, "生成审阅报告")}
          >
            <CheckCircle2 size={17} />
            生成审阅报告
          </button>
        </div>
      </div>
    </section>
  );
}
