import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "./api";

type Counts = {
  inputTokens: number;
  outputTokens: number;
  missingInputRecords: number;
  missingOutputRecords: number;
};
type UsageDay = Counts & {
  date: string;
  records: number;
  categories: Record<string, Counts>;
};
type UsageData = {
  daily: UsageDay[];
  totals: Counts;
  categories: Record<string, string>;
  timezone: string;
  initializedAt: string;
  legacyRecords: number;
  tasks: {
    id: string;
    time: string;
    category: string;
    inputTokens: number;
    outputTokens: number;
    missingInputRecords: number;
    missingOutputRecords: number;
    calls: number;
    status: string;
  }[];
};
const number = (n: number) => n.toLocaleString();
const compact = (n: number) =>
  n >= 1e6
    ? `${+(n / 1e6).toFixed(1)}M`
    : n >= 1000
      ? `${+(n / 1000).toFixed(1)}k`
      : String(n);
function UsageChart({
  data,
  field,
  title,
}: {
  data: UsageData;
  field: "inputTokens" | "outputTokens";
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 600);
  useEffect(() => {
    const resize = () => setNarrow(window.innerWidth <= 600);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const days = data.daily,
    max = Math.max(1, ...days.map((d) => d[field]));
  const ceiling = Math.max(
    10,
    Math.ceil(max / 10 ** Math.floor(Math.log10(max))) *
      10 ** Math.floor(Math.log10(max)),
  );
  const x0 = narrow ? 38 : 55,
    y0 = 24,
    width = narrow ? 318 : 670,
    height = narrow ? 125 : 145,
    step = width / days.length;
  const day = hover === null ? null : days[hover];
  const missing =
    field === "inputTokens" ? "missingInputRecords" : "missingOutputRecords";
  return (
    <div className="usage-chart-card">
      <div className="usage-chart-heading">
        <span>{title}</span>
        <strong>
          {number(data.totals[field])}
          <small> tokens</small>
        </strong>
      </div>
      <div className="usage-chart-plot" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${narrow ? 380 : 760} ${narrow ? 190 : 210}`}
          role="group"
          aria-label={`${title}每日柱状图`}
        >
          {[0, 0.5, 1].map((r) => (
            <g key={r}>
              <line
                x1={x0}
                x2={x0 + width}
                y1={y0 + height * (1 - r)}
                y2={y0 + height * (1 - r)}
                className="usage-grid"
              />
              <text
                x={x0 - 10}
                y={y0 + height * (1 - r) + 4}
                textAnchor="end"
                className="usage-axis"
              >
                {compact(ceiling * r)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = x0 + step * i,
              barHeight = (d[field] / ceiling) * height;
            return (
              <g
                key={d.date}
                role="button"
                tabIndex={0}
                aria-label={`${d.date} ${title} ${d[field]} tokens`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => setHover(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setHover(i);
                  }
                  if (e.key === "Escape") setHover(null);
                }}
              >
                <rect
                  x={x + step * 0.22}
                  y={y0 + height - Math.max(2, barHeight)}
                  width={step * 0.56}
                  height={Math.max(2, barHeight)}
                  rx={Math.min(4, step * 0.1)}
                  className={`usage-bar ${hover === i ? "hovered" : ""} ${!d[field] ? "empty" : ""}`}
                />
                <rect
                  x={x}
                  y={y0}
                  width={step}
                  height={height + 24}
                  fill="transparent"
                />
                {(days.length === 7 ||
                  i % 5 === 0 ||
                  i === days.length - 1) && (
                  <text
                    x={x + step / 2}
                    y={y0 + height + 25}
                    textAnchor="middle"
                    className="usage-axis"
                  >
                    {d.date.slice(5).replace("-", "/")}
                  </text>
                )}
              </g>
            );
          })}
          {hover !== null && (
            <line
              x1={x0 + step * (hover + 0.5)}
              x2={x0 + step * (hover + 0.5)}
              y1={y0}
              y2={y0 + height}
              className="usage-cursor"
            />
          )}
        </svg>
        {day && (
          <div
            className="usage-tooltip"
            role="tooltip"
            style={{
              left: `clamp(105px, ${((hover! + 0.5) / days.length) * 88 + 7}%, calc(100% - 105px))`,
            }}
          >
            <strong>
              {day.date} · {number(day[field])} tokens
            </strong>
            {Object.entries(data.categories)
              .filter(
                ([key]) =>
                  ["translation", "chat", "organization", "routes"].includes(
                    key,
                  ) ||
                  day.categories[key][field] ||
                  day.categories[key][missing],
              )
              .map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <span>
                    {number(day.categories[key][field])} tokens
                    {day.categories[key][missing] ? " + 未提供" : ""}
                  </span>
                </div>
              ))}
            {!!day[missing] && (
              <small>
                {day[missing]} 次调用未提供{title}用量
              </small>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export function TokenUsage() {
  const [days, setDays] = useState<7 | 30>(7),
    [data, setData] = useState<UsageData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  async function refresh() {
    setLoading(true);
    try {
      setData(
        await api<UsageData>(
          `/usage?days=${days}&timezone=${encodeURIComponent(timezone)}`,
        ),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    void api<UsageData>(
      `/usage?days=${days}&timezone=${encodeURIComponent(timezone)}`,
    )
      .then((d) => {
        if (!disposed) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [days, timezone]);
  return (
    <section className="token-usage" aria-label="token消耗量">
      <div className="usage-toolbar">
        <h3>Token 消耗量</h3>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={days === 7}
            onClick={() => setDays(7)}
          >
            最近七天
          </button>
          <button
            type="button"
            aria-pressed={days === 30}
            onClick={() => setDays(30)}
          >
            最近一个月
          </button>
        </div>
        <button
          type="button"
          aria-label="刷新token统计"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </div>
      {error && (
        <p className="config-error" role="alert">
          {error}
        </p>
      )}
      {!data && loading && <p className="muted">正在读取用量…</p>}
      {data && (
        <>
          <UsageChart
            key={`input-${days}`}
            data={data}
            field="inputTokens"
            title="输入"
          />
          <UsageChart
            key={`output-${days}`}
            data={data}
            field="outputTokens"
            title="输出"
          />
          <p className="usage-caption">
            全部研究空间 · {data.timezone} ·{" "}
            {days === 30 ? "最近 30 天" : "最近 7 天"}
            {data.totals.missingInputRecords || data.totals.missingOutputRecords
              ? ` · ${Math.max(data.totals.missingInputRecords, data.totals.missingOutputRecords)} 次调用有用量未提供`
              : ""}
          </p>
          <details className="usage-explanation">
            <summary>统计说明与最近任务</summary>
            <p>
              记录 API
              实际返回的用量，包括重试和有用量的失败响应；未提供的用量不估算。推理
              token
              属于输出用量，不重复相加。旧对话沿用已保存用量，旧翻译累计用量归入保存日；此前未记录的整理和路线无法补算。
            </p>
            <div className="usage-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>任务</th>
                    <th>输入</th>
                    <th>输出</th>
                    <th>调用</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {new Date(t.time).toLocaleString("zh-CN", {
                          hour12: false,
                        })}
                      </td>
                      <td>
                        {data.categories[t.category]}
                        {t.status === "failed" ? " · 失败" : ""}
                      </td>
                      <td>
                        {number(t.inputTokens)}
                        {t.missingInputRecords ? " + 未提供" : ""}
                      </td>
                      <td>
                        {number(t.outputTokens)}
                        {t.missingOutputRecords ? " + 未提供" : ""}
                      </td>
                      <td>{t.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
