import { useEffect, useId, useState, useRef, useMemo } from "react";
import {
  Focus,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  GitBranch,
  FileText,
  Command,
  Diamond,
} from "lucide-react";
import type { Workspace, Settings } from "./types";
import { categoryColor, workspaceTaxonomy } from "./types";
import { defaultSpacing, edgePath, layoutGraph } from "./graphLayout";
import { relationStyle } from "./relationStyles";
import { RelationStroke } from "./RelationStroke";
import {
  isGraphNodeVisible,
  paperGraphImportance,
  nodeDisplayNames,
  type NodeDisplayMode,
} from "./nodeVisibility";
import {
  layoutClusters,
  layoutFocus,
  type ClusterMemory,
} from "./relationshipLayouts";

function readSpacing(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return {
      horizontal: Number.isFinite(value?.horizontal)
        ? Math.max(160, Math.min(480, value.horizontal))
        : 270,
      vertical: Number.isFinite(value?.vertical)
        ? Math.max(120, Math.min(420, value.vertical))
        : 220,
    };
  } catch {
    return { ...defaultSpacing };
  }
}

export function Graph({
  w,
  paperMode,
  onSelect,
  focusId,
  onExitFocus,
  nodeSizes,
  timelineAutoWrap = false,
  timelineColumnLimit = 10,
  onAddNode,
}: {
  w: Workspace;
  nodeSizes?: Settings["nodeSizes"];
  timelineAutoWrap?: boolean;
  timelineColumnLimit?: number;
  focusId?: string | null;
  onExitFocus?: () => void;
  paperMode: boolean;
  onSelect: (kind: "paper" | "node", id: string) => void;
  onAddNode?: () => void;
}) {
  const layoutKey = `anistudy.graph-view.${w.id}`;
  const clusterKey = `anistudy.graph-clusters.${w.id}`;
  const namesKey = `anistudy.graph-cluster-names.${w.id}`;
  const read = (key: string, fallback: unknown) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  };
  const [overview, setOverview] = useState<"cluster" | "timeline">(() =>
    read(layoutKey, "cluster") === "timeline" ? "timeline" : "cluster",
  );
  const memory = useRef<ClusterMemory>(
    (() => {
      const saved = read(clusterKey, { groups: [] });
      return saved &&
        Array.isArray(saved.groups) &&
        saved.groups.every(
          (g: { id?: unknown; nodeIds?: unknown }) =>
            typeof g.id === "string" &&
            Array.isArray(g.nodeIds) &&
            g.nodeIds.every((id) => typeof id === "string"),
        )
        ? saved
        : { groups: [] };
    })(),
  );
  const [groupNames, setGroupNames] = useState<Record<string, string>>(() => {
    const v = read(namesKey, {});
    return v && typeof v === "object" && !Array.isArray(v)
      ? (Object.fromEntries(
          Object.entries(v).filter(([, name]) => typeof name === "string"),
        ) as Record<string, string>)
      : {};
  });
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [clusterRevision, setClusterRevision] = useState(0);
  const [showWeakRelations, setShowWeakRelations] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const [panning, setPanning] = useState(false);
  const panCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => panCleanup.current?.(), []);
  const view = paperMode
    ? "timeline"
    : focusId && w.nodes.some((n) => n.id === focusId)
      ? "focus"
      : overview;
  function changeOverview(next: "cluster" | "timeline") {
    setOverview(next);
    onExitFocus?.();
    setFilter(null);
    setQuery("");
    setActive(null);
    try {
      localStorage.setItem(layoutKey, JSON.stringify(next));
    } catch {}
  }
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [active, setActive] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);
  const spacingKey = `anistudy.graph-spacing.${w.id}.${paperMode ? "paper" : "technology"}`;
  const heightKey = `anistudy.graph-height.${w.id}.${paperMode ? "paper" : "technology"}`;
  const displayKey = `anistudy.graph-node-display.${w.id}.${paperMode ? "paper" : "technology"}`;
  function readDisplay(key: string): NodeDisplayMode {
    const saved = read(key, "all");
    return Object.hasOwn(nodeDisplayNames, saved) ? saved : "all";
  }
  const [nodeDisplay, setNodeDisplay] = useState<NodeDisplayMode>(() =>
    readDisplay(displayKey),
  );
  useEffect(() => setNodeDisplay(readDisplay(displayKey)), [displayKey]);
  function changeNodeDisplay(mode: NodeDisplayMode) {
    setNodeDisplay(mode);
    setActive(null);
    try {
      localStorage.setItem(displayKey, JSON.stringify(mode));
    } catch {}
  }
  function readHeight(key: string): number | null {
    try {
      const value = Number(localStorage.getItem(key));
      return value > 0 && Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }
  const [preferredHeight, setPreferredHeight] = useState(() =>
    readHeight(heightKey),
  );
  useEffect(() => {
    setPreferredHeight(readHeight(heightKey));
    setFilter(null);
    setQuery("");
    setActive(null);
  }, [heightKey]);
  const minimumHeight = Math.min(360, viewportHeight);
  const graphHeight = Math.min(
    viewportHeight,
    Math.max(minimumHeight, preferredHeight ?? viewportHeight),
  );
  function updateHeight(value: number | null) {
    setPreferredHeight(value);
    try {
      if (value === null) localStorage.removeItem(heightKey);
      else localStorage.setItem(heightKey, String(value));
    } catch {}
  }
  const [spacing, setSpacing] = useState(() => readSpacing(spacingKey));
  useEffect(() => setSpacing(readSpacing(spacingKey)), [spacingKey]);
  function updateSpacing(next: typeof spacing) {
    setSpacing(next);
    try {
      localStorage.setItem(spacingKey, JSON.stringify(next));
    } catch {}
  }
  const id = useId().replace(/:/g, "");
  const directions = workspaceTaxonomy(w, "directions");
  const categories = workspaceTaxonomy(w, "categories");
  const technologyNodes = useMemo(
    () =>
      w.nodes
        .filter((n) => isGraphNodeVisible(n, nodeDisplay))
        .map((n) => ({
          ...n,
          radius: nodeSizes?.[
            n.importance as keyof NonNullable<Settings["nodeSizes"]>
          ]
            ? nodeSizes[
                n.importance as keyof NonNullable<Settings["nodeSizes"]>
              ] / 2
            : undefined,
          directions: n.directions || [n.direction],
        })),
    [w.nodes, nodeSizes, nodeDisplay],
  );
  const raw = paperMode
    ? w.papers
        .map((p) => ({
          id: p.id,
          name: p.short || p.title,
          year: p.year,
          category: "Architecture",
          importance: "major",
          hiddenInGraph: p.hiddenInGraph,
          filterImportance: paperGraphImportance(p.id, w.nodes),
          evidence: p.inLibrary ? "supported" : "missing",
          status: p.status,
          directions: ["General"],
        }))
        .filter((n) =>
          isGraphNodeVisible(
            { ...n, importance: n.filterImportance },
            nodeDisplay,
          ),
        )
    : technologyNodes;
  const categoryNames = Object.fromEntries(
    categories.map((c) => [c.id, c.name]),
  );
  const clusterLayout = useMemo(
    () =>
      view === "cluster"
        ? layoutClusters(
            technologyNodes,
            w.edges,
            spacing,
            memory.current,
            categoryNames,
            w.routes.filter((r) => r.selected),
          )
        : null,
    [
      view,
      technologyNodes,
      w.edges,
      w.routes,
      w.taxonomy,
      spacing,
      clusterRevision,
    ],
  );
  useEffect(() => {
    if (clusterLayout && nodeDisplay === "all") {
      memory.current = clusterLayout.memory;
      try {
        localStorage.setItem(clusterKey, JSON.stringify(clusterLayout.memory));
      } catch {}
    }
  }, [clusterLayout, clusterKey, nodeDisplay]);
  const focusLayout = useMemo(
    () =>
      view === "focus"
        ? layoutFocus(technologyNodes, w.edges, focusId!, spacing)
        : null,
    [view, technologyNodes, w.edges, focusId, spacing],
  );
  const nodes = raw.filter((n) =>
    view === "focus"
      ? focusLayout!.positions.has(n.id)
      : (filter === null || n.directions.includes(filter)) &&
        n.name.toLowerCase().includes(query.toLowerCase()),
  );
  const timeline = layoutGraph(nodes, spacing, {
    autoWrap: timelineAutoWrap,
    maxNodesPerColumn: timelineColumnLimit,
  });
  const { width, height, positions } = clusterLayout || focusLayout || timeline;
  const { columns, yearX } = timeline;
  const regions = (clusterLayout || focusLayout)?.regions || [];
  const visible = new Set(nodes.map((n) => n.id));
  const edges = (paperMode ? w.paperEdges : w.edges).filter(
    (e) =>
      visible.has(e.source) &&
      visible.has(e.target) &&
      (view !== "cluster" ||
        showWeakRelations ||
        e.source === active ||
        e.target === active ||
        !["Inspired by", "Popularized by"].includes(e.relation)) &&
      positions.has(e.source) &&
      positions.has(e.target),
  );
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const scroll = scrollRef.current;
      if (!scroll) {
        event.preventDefault();
        return;
      }
      const factor =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? scroll.clientHeight
            : 1;
      scroll.scrollTop += (event.shiftKey ? 0 : event.deltaY) * factor;
      scroll.scrollLeft +=
        (event.deltaX + (event.shiftKey ? event.deltaY : 0)) * factor;
      event.preventDefault();
    };
    card.addEventListener("wheel", wheel, { passive: false });
    return () => card.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    if (view === "focus") {
      setZoom(1);
      setFilter(null);
      setQuery("");
      setActive(null);
      const scroll = scrollRef.current;
      const p = positions.get(focusId!);
      if (scroll && p) {
        scroll.scrollTo({
          left: Math.max(0, p.x - scroll.clientWidth / 2),
          top: 0,
        });
        scroll.closest(".graph-card")?.scrollIntoView({ block: "start" });
      }
    }
  }, [view, focusId]);
  const connected = new Set(
    active
      ? [
          active,
          ...edges
            .filter((e) => e.source === active || e.target === active)
            .flatMap((e) => [e.source, e.target]),
        ]
      : [],
  );
  return (
    <div
      className="graph-card"
      ref={cardRef}
      style={{ height: graphHeight, maxHeight: viewportHeight }}
    >
      {!paperMode && (
        <div className="graph-view-bar" aria-label="图谱布局">
          <button
            className={view === "cluster" ? "active" : ""}
            onClick={() => changeOverview("cluster")}
          >
            关系聚类
          </button>
          <button
            className={view === "timeline" ? "active" : ""}
            onClick={() => changeOverview("timeline")}
          >
            时间轴
          </button>
          {view === "cluster" && (
            <button
              title="按最新关系重新分组，节点位置可能变化"
              onClick={() => {
                memory.current = { groups: [] };
                setClusterRevision((v) => v + 1);
              }}
            >
              重新聚类
            </button>
          )}
          {view === "cluster" && (
            <label className="weak-relations">
              <input
                type="checkbox"
                checked={showWeakRelations}
                onChange={(e) => setShowWeakRelations(e.target.checked)}
              />
              显示启发／推广连线
            </label>
          )}
          {view === "focus" ? (
            <>
              <span className="focus-title">
                目标中心 · {w.nodes.find((n) => n.id === focusId)?.name}
              </span>
              <button onClick={() => onExitFocus?.()}>退出目标中心</button>
            </>
          ) : (
            <small>
              {view === "cluster"
                ? "按关系、共用论文与学习路线聚类 · 点击群名可重命名"
                : "按年份查看技术演化"}
            </small>
          )}
        </div>
      )}
      {renaming && (
        <form
          className="cluster-rename"
          onSubmit={(e) => {
            e.preventDefault();
            const name = renaming.name.trim();
            if (!name) return;
            const next = { ...groupNames, [renaming.id]: name };
            setGroupNames(next);
            try {
              localStorage.setItem(namesKey, JSON.stringify(next));
            } catch {}
            setRenaming(null);
          }}
        >
          <label>
            技术群名称
            <input
              autoFocus
              aria-label="技术群名称"
              maxLength={60}
              value={renaming.name}
              onChange={(e) =>
                setRenaming({ ...renaming, name: e.target.value })
              }
            />
          </label>
          <button type="submit">保存群名</button>
          <button type="button" onClick={() => setRenaming(null)}>
            取消
          </button>
        </form>
      )}
      <div className="graph-toolbar">
        <div className="graph-tabs">
          {view === "focus" ? (
            <span className="focus-context">
              当前目标的 {Math.max(0, nodes.length - 1)} 个直接关联 ·
              点击节点详情可更换中心
            </span>
          ) : (
            <button
              className={filter === null ? "active" : ""}
              onClick={() => setFilter(null)}
            >
              全部方向
            </button>
          )}
          {!paperMode &&
            view !== "focus" &&
            directions.map(({ id: key, name: label }) => (
              <button
                key={key}
                className={filter === key ? "active" : ""}
                onClick={() => {
                  setFilter(key);
                  setActive(null);
                }}
              >
                {label}
                <small>
                  {raw.filter((n) => n.directions.includes(key)).length}
                </small>
              </button>
            ))}
        </div>
        <div className="graph-search" hidden={view === "focus"}>
          <Search size={15} />
          <input
            aria-label="搜索图谱节点"
            placeholder="查找节点…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="graph-spacing">
        <span>
          <SlidersHorizontal size={13} />
          节点间距
        </span>
        <label>
          横向
          <input
            type="range"
            aria-label="横向节点间距"
            min="160"
            max="480"
            step="10"
            value={spacing.horizontal}
            onChange={(e) =>
              updateSpacing({ ...spacing, horizontal: Number(e.target.value) })
            }
          />
          <output>{spacing.horizontal}px</output>
        </label>
        <label>
          纵向
          <input
            type="range"
            aria-label="纵向节点间距"
            min="120"
            max="420"
            step="10"
            value={spacing.vertical}
            onChange={(e) =>
              updateSpacing({ ...spacing, vertical: Number(e.target.value) })
            }
          />
          <output>{spacing.vertical}px</output>
        </label>
        <label>
          高度
          <input
            type="range"
            aria-label="图谱窗口高度"
            min={minimumHeight}
            max={viewportHeight}
            step="1"
            value={graphHeight}
            onChange={(e) => updateHeight(Number(e.target.value))}
          />
          <output>{graphHeight}px</output>
        </label>
        <button
          aria-label="恢复默认图谱高度"
          onClick={() => updateHeight(null)}
        >
          默认高度
        </button>
        <button
          aria-label="重置节点间距"
          onClick={() => updateSpacing({ ...defaultSpacing })}
        >
          恢复默认
        </button>
        <div
          className="graph-node-display"
          role="group"
          aria-label="节点显示模式"
        >
          {(
            Object.entries(nodeDisplayNames) as [NodeDisplayMode, string][]
          ).map(([mode, name]) => (
            <button
              key={mode}
              aria-pressed={nodeDisplay === mode}
              onClick={() => changeNodeDisplay(mode)}
            >
              {name}
            </button>
          ))}
        </div>
        {!paperMode && onAddNode && (
          <button onClick={onAddNode} className="graph-add-node">
            <Plus size={15} /> 新增
          </button>
        )}
        <div className="zoom-controls">
          <button
            aria-label="缩小图谱"
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="放大图谱"
            onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
          >
            <Plus size={15} />
          </button>
          <button
            aria-label="重置图谱"
            onClick={() => {
              setZoom(1);
              setFilter(null);
              setQuery("");
              setActive(null);
              updateSpacing({ ...defaultSpacing });
              updateHeight(null);
            }}
          >
            <Focus size={16} />
          </button>
        </div>
      </div>
      {nodes.length ? (
        <div
          className="graph-scroll"
          ref={scrollRef}
          data-panning={panning}
          onPointerDown={(e) => {
            if (e.button !== 0 || e.pointerType !== "mouse") return;
            panCleanup.current?.();
            const area = e.currentTarget,
              x = e.clientX,
              y = e.clientY,
              left = area.scrollLeft,
              top = area.scrollTop;
            let moved = false;
            const move = (event: PointerEvent) => {
              if (
                !moved &&
                Math.hypot(event.clientX - x, event.clientY - y) < 5
              )
                return;
              if (!moved) {
                moved = true;
                suppressClick.current = true;
                setPanning(true);
                area.setPointerCapture(event.pointerId);
              }
              event.preventDefault();
              area.scrollLeft = left + x - event.clientX;
              area.scrollTop = top + y - event.clientY;
            };
            const finish = () => {
              setPanning(false);
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", finish);
              window.removeEventListener("pointercancel", finish);
              window.removeEventListener("blur", finish);
              panCleanup.current = null;
              setTimeout(() => {
                suppressClick.current = false;
              }, 0);
            };
            window.addEventListener("pointermove", move, { passive: false });
            window.addEventListener("pointerup", finish);
            window.addEventListener("pointercancel", finish);
            window.addEventListener("blur", finish);
            panCleanup.current = finish;
          }}
          onClickCapture={(e) => {
            if (suppressClick.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          tabIndex={0}
          aria-label="图谱滚动区域"
        >
          <svg
            className="knowledge-graph"
            style={{
              width: width * zoom,
              height: height * zoom,
              minWidth: width * zoom,
              maxHeight: "none",
            }}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              paperMode
                ? "论文关系时间图谱"
                : view === "timeline"
                  ? "技术演化时间图谱"
                  : view === "focus"
                    ? "技术目标中心图谱"
                    : "技术关系聚类图谱"
            }
            onMouseLeave={() => setActive(null)}
          >
            <defs>
              <pattern
                id={`dots-${id}`}
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r=".8" fill="#dbe1e2" />
              </pattern>
              {[false, true].map((highlight) => (
                <marker
                  key={String(highlight)}
                  id={`arrow-${id}-${highlight}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill={highlight ? "#568e7d" : "#a4b9af"}
                  />
                </marker>
              ))}
            </defs>
            <rect width={width} height={height} fill={`url(#dots-${id})`} />
            {view === "timeline" &&
              columns.map(({ year, index, count }, i) => (
                <g key={`${year ?? "unknown"}-${index}`}>
                  <line
                    x1={yearX(i)}
                    y1="35"
                    x2={yearX(i)}
                    y2={height - 60}
                    stroke="#e8edee"
                    strokeDasharray="3 7"
                  />
                  <text
                    className="year-label"
                    x={yearX(i)}
                    y={height - 28}
                    textAnchor="middle"
                    fill="#869292"
                    fontSize="12"
                  >
                    {year ?? "年份待识别"}
                    {count > 1 ? ` · ${index + 1}/${count}` : ""}
                  </text>
                </g>
              ))}
            {regions
              .filter((region) => region.nodeIds.some((id) => visible.has(id)))
              .map((region) => (
                <g
                  className="graph-region"
                  key={region.id}
                  data-region={region.id}
                >
                  <rect
                    x={region.x}
                    y={region.y}
                    width={region.width}
                    height={region.height}
                    rx="18"
                    fill={
                      view === "focus" && region.id === "components"
                        ? "#edf5ed"
                        : "#f5f8f5"
                    }
                    fillOpacity="0.65"
                    stroke="#dce7df"
                    strokeDasharray={view === "cluster" ? "6 5" : undefined}
                  />
                  <text
                    x={region.x + 18}
                    y={region.y + 30}
                    fontSize="12"
                    fill="#678773"
                    role={view === "cluster" ? "button" : undefined}
                    tabIndex={view === "cluster" ? 0 : undefined}
                    aria-label={
                      view === "cluster"
                        ? `重命名技术群 ${groupNames[region.id] || region.label}`
                        : undefined
                    }
                    onClick={() => {
                      if (view === "cluster")
                        setRenaming({
                          id: region.id,
                          name: groupNames[region.id] || region.label,
                        });
                    }}
                    onKeyDown={(e) => {
                      if (
                        view === "cluster" &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        setRenaming({
                          id: region.id,
                          name: groupNames[region.id] || region.label,
                        });
                      }
                    }}
                  >
                    {view === "cluster"
                      ? groupNames[region.id] || region.label
                      : region.label}
                  </text>
                </g>
              ))}
            {edges.map((e, i) => {
              const shape = edgePath(
                positions.get(e.source)!,
                positions.get(e.target)!,
                i % 2,
              );
              const highlighted = e.source === active || e.target === active;
              return (
                <g
                  key={e.id}
                  opacity={highlighted ? 1 : active ? 0.18 : 0.6}
                  pointerEvents="none"
                >
                  <RelationStroke
                    relation={e.relation}
                    d={shape.d}
                    edge={e}
                    highlighted={highlighted}
                    color={highlighted ? "#568e7d" : "#a4b9af"}
                    marker={`url(#arrow-${id}-${highlighted})`}
                  />
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = positions.get(n.id)!;
              const color = categoryColor(n.category);
              const related = connected.has(n.id);
              const minor = !paperMode && n.importance === "minor";
              const compact = minor || p.r < 16;
              return (
                <g
                  key={n.id}
                  className={`graph-node ${related ? "related" : ""} ${active === n.id ? "active" : ""}`}
                  data-node-id={n.id}
                  data-importance={n.importance}
                  data-focus={
                    view === "focus" && n.id === focusId ? "true" : undefined
                  }
                  data-x={p.x}
                  data-y={p.y}
                  opacity={active && !related ? 0.35 : 1}
                  role="button"
                  tabIndex={0}
                  aria-label={`查看 ${n.name}`}
                  onMouseEnter={() => setActive(n.id)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(n.id)}
                  onBlur={() => setActive(null)}
                  onClick={() => onSelect(paperMode ? "paper" : "node", n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(paperMode ? "paper" : "node", n.id);
                    }
                  }}
                >
                  <title>{n.name}</title>
                  <circle
                    className="node-hit-area"
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(22, p.r + 9)}
                    fill="transparent"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.r + 9}
                    fill={color}
                    opacity={compact ? 0 : related ? 0.12 : 0.04}
                  />
                  <circle
                    className="node-shape"
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill={
                      minor || n.evidence === "missing"
                        ? "#fafbf9"
                        : color + "17"
                    }
                    stroke={color}
                    strokeWidth={
                      view === "focus" && n.id === focusId
                        ? 3
                        : related
                          ? 2.5
                          : 1.5
                    }
                    strokeDasharray={
                      n.evidence === "missing"
                        ? minor
                          ? "2 2"
                          : "5 4"
                        : undefined
                    }
                  />
                  {!compact && (
                    <g
                      className="node-symbol"
                      transform={`translate(${p.x - 8}, ${p.y - 8})`}
                      color={color}
                      aria-hidden="true"
                    >
                      {paperMode ? (
                        <FileText width={16} height={16} />
                      ) : n.category === "Architecture" ? (
                        <Command width={16} height={16} />
                      ) : (
                        <Diamond width={16} height={16} />
                      )}
                    </g>
                  )}
                  <text
                    className="node-label"
                    x={p.x}
                    y={p.y + p.r + 25}
                    textAnchor="middle"
                    fill="#344345"
                    fontSize="12"
                    fontWeight={related ? "600" : "500"}
                  >
                    {p.lines.map((line, i) => (
                      <tspan key={i} x={p.x} dy={i ? 17 : 0}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {n.status === "learned" && compact && (
                    <circle
                      className="node-learned-dot"
                      cx={p.x + p.r * 0.7 + 5}
                      cy={p.y - p.r * 0.7 - 5}
                      r={2.5}
                      fill="#367b69"
                    />
                  )}
                  {n.status === "learned" && !compact && (
                    <g>
                      <circle
                        cx={p.x + p.r * 0.7}
                        cy={p.y - p.r * 0.7}
                        r="8"
                        fill="#367b69"
                        stroke="white"
                        strokeWidth="2"
                      />
                      <path
                        d={`m ${p.x + p.r * 0.7 - 3} ${p.y - p.r * 0.7} 2 2 4 -4`}
                        fill="none"
                        stroke="white"
                        strokeWidth="1.3"
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="empty">
          <GitBranch size={38} />
          <h3>
            {(paperMode ? w.papers : w.nodes).length
              ? "当前筛选下暂无节点"
              : "让第一篇论文成为起点"}
          </h3>
          <p>
            {nodeDisplay === "minimal" && paperMode
              ? "极简模式只显示关联重要／里程碑技术的未隐藏论文。"
              : nodeDisplay !== "all"
                ? "已隐藏的节点仍可在全部节点模式查看。"
                : "导入并整理论文，关键技术与关系会自动加入图谱。"}
          </p>
          {nodeDisplay !== "all" && (
            <button
              className="secondary"
              onClick={() => changeNodeDisplay("all")}
            >
              显示全部节点
            </button>
          )}
        </div>
      )}
      <div className="graph-bottom">
        <span>
          <i className="legend-circle" />
          已有资料支持
        </span>
        <span>
          <i className="legend-circle dashed" />
          待补足知识
        </span>
        <span className="muted">
          {view === "timeline"
            ? "悬停节点查看关联 · 年份以最初公开为准"
            : view === "focus"
              ? "展示目标的直接关联 · 仅 Requires 归入必要前置"
              : "邻近与分组表达关联 · 坐标不表示年份或学习顺序"}
        </span>
      </div>
      {!!edges.length && (
        <div className="relation-legend" aria-label="关系线型图例">
          <span className="relation-legend-heading">关系线型</span>
          {[...new Set(edges.map((e) => e.relation))].map((relation) => {
            const style = relationStyle(relation);
            return (
              <span
                className="relation-legend-item"
                key={relation}
                aria-label={`${style.label}：${style.pattern}`}
              >
                <svg
                  width="40"
                  height="12"
                  viewBox="0 0 40 12"
                  aria-hidden="true"
                >
                  <RelationStroke
                    relation={relation}
                    d="M 3 6 L 37 6"
                    color="#77998a"
                  />
                </svg>
                {style.label}
              </span>
            );
          })}
        </div>
      )}
      {!paperMode && (
        <div className="category-legend">
          <SlidersHorizontal size={13} />
          {categories.map(({ id: key, name: label }) => (
            <span key={key}>
              <i style={{ background: categoryColor(key) }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
