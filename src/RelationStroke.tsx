import { relationStyle } from "./relationStyles";

export function RelationStroke({
  relation,
  d,
  color,
  highlighted = false,
  edge,
  marker,
}: {
  relation: string;
  d: string;
  color: string;
  highlighted?: boolean;
  edge?: { source: string; target: string };
  marker?: string;
}) {
  const style = relationStyle(relation);
  const width = style.width + (highlighted ? 0.6 : 0);
  return (
    <>
      <path
        className={
          edge ? `graph-edge ${highlighted ? "highlighted" : ""}` : undefined
        }
        data-source={edge?.source}
        data-target={edge?.target}
        data-relation={edge ? relation : undefined}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={style.dash}
        strokeLinecap={style.hollow ? "butt" : "round"}
      />
      {style.hollow && (
        <path
          className="edge-hollow-center"
          d={d}
          fill="none"
          stroke="white"
          strokeWidth={width - 2}
          strokeDasharray={style.dash}
          strokeLinecap="butt"
          pointerEvents="none"
        />
      )}
      {marker && (
        <path
          d={d}
          fill="none"
          stroke="none"
          markerEnd={marker}
          pointerEvents="none"
        />
      )}
    </>
  );
}
