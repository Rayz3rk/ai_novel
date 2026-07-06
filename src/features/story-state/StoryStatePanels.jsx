import React from "react";
import { Clock3, GitBranch } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";

export function StoryStateOverview({
  project,
  compact = false,
  formatTime,
  summarizeInlineText,
  mapStoryStateSourceLabel,
  mapStoryHeatLabel,
  mapRelationshipKindLabel
}) {
  const events = project.storyStateEvents || [];
  const latestEvent = events[0] || null;
  const summary = project.storyStateSummary || {};
  const activeEntities = (summary.activeEntities || []).slice(0, compact ? 6 : 12);
  const relationshipThreads = (summary.relationshipThreads || []).slice(0, compact ? 4 : 8);
  const carryovers = (summary.carryovers || []).slice(0, compact ? 4 : 8);
  const pressureWarnings = (summary.pressureWarnings || []).slice(0, compact ? 3 : 6);
  const foreshadowBoard = (summary.foreshadowBoard || []).slice(0, compact ? 4 : 8);

  if (!latestEvent) {
    return <EmptyState text="还没有故事状态记录，先完成一次生成或入库后这里会出现 diff。" />;
  }

  return (
    <div className="story-state-shell">
      <div className="story-state-metrics">
        <div className="metric compact">
          <span>最新章节</span>
          <strong>第 {latestEvent.chapterNumber} 章</strong>
        </div>
        <div className="metric compact">
          <span>活跃设定</span>
          <strong>{summary.activeEntities?.length || 0}</strong>
        </div>
        <div className="metric compact">
          <span>关系线</span>
          <strong>{summary.relationshipThreads?.length || 0}</strong>
        </div>
        <div className="metric compact">
          <span>延续压力</span>
          <strong>{summary.carryovers?.length || 0}</strong>
        </div>
      </div>

      <article className="story-state-latest">
        <header>
          <div>
            <span>{mapStoryStateSourceLabel(latestEvent.source)}</span>
            <strong>第 {latestEvent.chapterNumber} 章 · {latestEvent.chapterTitle}</strong>
          </div>
          <small>{formatTime(latestEvent.createdAt)}</small>
        </header>
        <p>{latestEvent.summary || "暂无摘要。"}</p>
      </article>

      <div className="story-state-grid">
        <div className="story-state-card">
          <strong>活跃设定</strong>
          {activeEntities.length ? (
            <div className="story-chip-list">
              {activeEntities.map((item) => (
                <span key={item.settingId} className={`story-chip ${item.heat || "cool"}`}>
                  {item.name} · {mapStoryHeatLabel(item.heat)}
                </span>
              ))}
            </div>
          ) : (
            <small>当前没有活跃设定。</small>
          )}
        </div>

        <div className="story-state-card">
          <strong>关系线</strong>
          {relationshipThreads.length ? (
            <div className="story-line-list">
              {relationshipThreads.map((item) => (
                <div key={`${item.pair.join("-")}-${item.lastChapterNumber}`} className="story-line-item">
                  <span>{item.pair.join(" / ")}</span>
                  <small>{mapRelationshipKindLabel(item.kind)} · 第 {item.lastChapterNumber} 章</small>
                </div>
              ))}
            </div>
          ) : (
            <small>当前没有显著的关系变化。</small>
          )}
        </div>

        <div className="story-state-card">
          <strong>延续压力</strong>
          {carryovers.length ? (
            <ul className="story-bullet-list">
              {carryovers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <small>当前没有需要延续处理的压力点。</small>
          )}
        </div>

        <div className="story-state-card">
          <strong>伏笔板</strong>
          {foreshadowBoard.length ? (
            <div className="story-line-list">
              {foreshadowBoard.map((item) => (
                <div key={item.id} className="story-line-item">
                  <span>{summarizeInlineText(item.content, compact ? 28 : 42)}</span>
                  <small>
                    {item.status}
                    {item.lastTouchedChapterNumber ? ` · 最近触达第 ${item.lastTouchedChapterNumber} 章` : ""}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <small>当前没有伏笔记录。</small>
          )}
        </div>
      </div>

      {pressureWarnings.length ? (
        <div className="story-warning-box">
          {pressureWarnings.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StoryStateTab({
  project,
  formatTime,
  summarizeInlineText,
  mapStoryStateSourceLabel,
  mapStoryHeatLabel,
  mapRelationshipKindLabel
}) {
  const events = project.storyStateEvents || [];

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Story Graph</p>
            <h2>故事状态总览</h2>
          </div>
          <Clock3 size={20} />
        </div>
        <StoryStateOverview
          project={project}
          formatTime={formatTime}
          summarizeInlineText={summarizeInlineText}
          mapStoryStateSourceLabel={mapStoryStateSourceLabel}
          mapStoryHeatLabel={mapStoryHeatLabel}
          mapRelationshipKindLabel={mapRelationshipKindLabel}
        />
      </div>

      <div className="panel result-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">State Timeline</p>
            <h2>状态时间线</h2>
          </div>
          <GitBranch size={20} />
        </div>
        {events.length ? (
          <div className="story-event-list">
            {events.map((event) => (
              <article className="story-event-card" key={event.id}>
                <header>
                  <div>
                    <span>{mapStoryStateSourceLabel(event.source)}</span>
                    <strong>第 {event.chapterNumber} 章 · {event.chapterTitle}</strong>
                  </div>
                  <small>{formatTime(event.createdAt)}</small>
                </header>
                <p>{event.summary || "暂无摘要。"}</p>

                {(event.stateDiff?.activatedSettings || []).length ? (
                  <div className="story-event-section">
                    <strong>激活设定</strong>
                    <div className="story-chip-list">
                      {event.stateDiff.activatedSettings.map((item) => (
                        <span key={`${event.id}-${item.settingId}`} className="story-chip warm">
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(event.stateDiff?.relationshipSignals || []).length ? (
                  <div className="story-event-section">
                    <strong>关系变化</strong>
                    <ul className="story-bullet-list tight">
                      {event.stateDiff.relationshipSignals.map((item, index) => (
                        <li key={`${event.id}-rel-${index}`}>
                          {item.pair.join(" / ")} · {mapRelationshipKindLabel(item.kind)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(event.impactSummary?.nextChapterPressure || []).length ? (
                  <div className="story-event-section">
                    <strong>下章压力</strong>
                    <ul className="story-bullet-list tight">
                      {event.impactSummary.nextChapterPressure.map((item) => (
                        <li key={`${event.id}-carry-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {(event.impactSummary?.affectedChapters || []).length ? (
                  <div className="story-event-section">
                    <strong>受影响章节</strong>
                    <div className="story-line-list">
                      {event.impactSummary.affectedChapters.map((item) => (
                        <div key={`${event.id}-${item.chapterId}`} className="story-line-item">
                          <span>第 {item.chapterNumber} 章 · {item.chapterTitle}</span>
                          <small>{item.reason}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(event.impactSummary?.risks || []).length ? (
                  <div className="story-warning-box compact">
                    {event.impactSummary.risks.map((item) => (
                      <p key={`${event.id}-risk-${item}`}>{item}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="还没有故事状态事件记录。" />
        )}
      </div>

      <div className="panel wide">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Plot Map</p>
            <h2>剧情图</h2>
          </div>
          <GitBranch size={20} />
        </div>
        <PlotMap project={project} />
      </div>
    </section>
  );
}

export function PlotMap({ project }) {
  if (!project.chapters.length) {
    return <EmptyState text="还没有章节，暂时无法生成剧情图。" />;
  }

  return (
    <div className="plot-map">
      {project.chapters.map((chapter) => (
        <article className="plot-node" key={chapter.id}>
          <span>第 {chapter.number} 章</span>
          <strong>{chapter.title}</strong>
          <div>
            {chapter.beats.slice(0, 4).map((beat) => (
              <small key={beat}>{beat}</small>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export function ReportCard({ report }) {
  const riskClass = report.score >= 80 ? "good" : report.score >= 60 ? "medium" : "high";
  return (
    <article className={`report-card ${riskClass}`}>
      <header>
        <span>审阅得分</span>
        <strong>{report.score}</strong>
      </header>
      <div className="report-lines">
        {report.findings.map((finding) => (
          <p key={`${finding.level}-${finding.title}`}>
            <b>{finding.level}</b>
            {finding.title}：{finding.detail}
          </p>
        ))}
      </div>
    </article>
  );
}
