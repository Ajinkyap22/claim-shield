import { useEffect, useState } from "react";

interface ScoreGaugeProps {
  score: number;
  animated?: boolean;
}

export function getScoreConfig(score: number) {
  if (score < 30)
    return {
      color: "#16a34a",
      bg: "#dcfce7",
      label: "Low Risk",
      textColor: "#15803d",
    };
  if (score < 60)
    return {
      color: "#ca8a04",
      bg: "#fef9c3",
      label: "Moderate Risk",
      textColor: "#a16207",
    };
  if (score < 80)
    return {
      color: "#ea580c",
      bg: "#ffedd5",
      label: "Elevated Risk",
      textColor: "#c2410c",
    };
  return {
    color: "#dc2626",
    bg: "#fee2e2",
    label: "High Risk",
    textColor: "#b91c1c",
  };
}

// All angles in standard math convention (CCW from right, Y-up).
// Points: x = cx + r*cos(θ), y = cy - r*sin(θ)  ← negated y for SVG (Y-down)
// 0° = right (3 o'clock), 90° = top (12 o'clock), 180° = left (9 o'clock)
// Gauge: 0% at 180° (left), 100% at 0° (right), sweeping through 90° (top).
// Arc direction: sweep-flag=0 (CCW in SVG screen = going upward from left, through top, to right)

const CX = 110;
const CY = 110;
const R = 82;
const STROKE_W = 15;

function pt(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
): string {
  // fromDeg > toDeg (e.g. 180→0): sweep clockwise in SVG (sweep-flag=1) goes through the top.
  // x = cx + r*cos(θ), y = cy - r*sin(θ) → 0°=right, 90°=top, 180°=left
  const p1 = pt(cx, cy, r, fromDeg);
  const p2 = pt(cx, cy, r, toDeg);
  const sweepAngle = Math.abs(fromDeg - toDeg);
  const largeArc = sweepAngle > 180 ? 1 : 0;
  // sweep-flag=1 = clockwise in SVG screen space = goes from 9-o'clock through 12 to 3-o'clock
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

// Score s (0-100) → angle in math degrees (180° → 0°)
function scoreToAngle(s: number): number {
  return 180 - s * 1.8;
}

// Zone definitions [score%, color]
const ZONES = [
  { from: 0, to: 30, color: "#86efac", label: "Low" },
  { from: 30, to: 60, color: "#fde68a", label: "Moderate" },
  { from: 60, to: 80, color: "#fdba74", label: "Elevated" },
  { from: 80, to: 100, color: "#fca5a5", label: "High" },
];

export function ScoreGauge({ score, animated = true }: ScoreGaugeProps) {
  const [displayScore, setDisplayScore] = useState(animated ? 0 : score);
  const config = getScoreConfig(score);

  useEffect(() => {
    if (!animated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayScore(score);
      return;
    }
    let start: number | null = null;
    const duration = 1300;
    const frame = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(eased * score));
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [score, animated]);

  // Score arc
  const scoreAngle = scoreToAngle(displayScore);
  const scoreArcPathStr =
    displayScore > 0 ? arcPath(CX, CY, R, 180, Math.max(scoreAngle, 0.5)) : "";

  // Needle
  const needleAngle = scoreToAngle(displayScore);
  const needleLen = R - 8;
  const needleTip = pt(CX, CY, needleLen, needleAngle);

  // Zone tick positions (at zone boundaries: 30%, 60%, 80%)
  const tickAngles = [30, 60, 80].map(scoreToAngle);

  return (
    <div className="flex flex-col items-center w-full py-2">
      <svg
        viewBox="0 0 220 165"
        className="w-full max-w-[240px]"
        style={{ overflow: "visible" }}
      >
        <defs>
          <filter id="gaugeShadow">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="3"
              floodColor="rgba(0,0,0,0.15)"
            />
          </filter>
        </defs>

        {/* Zone arcs (background) */}
        {ZONES.map((zone, i) => (
          <path
            key={i}
            d={arcPath(
              CX,
              CY,
              R,
              scoreToAngle(zone.from),
              scoreToAngle(zone.to),
            )}
            fill="none"
            stroke={zone.color}
            strokeWidth={STROKE_W}
            strokeLinecap="butt"
          />
        ))}

        {/* Track outline for depth */}
        <path
          d={arcPath(CX, CY, R, 180, 0.5)}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={STROKE_W + 2}
          strokeLinecap="round"
        />

        {/* Score arc (solid, on top of zones) */}
        {scoreArcPathStr && (
          <path
            d={scoreArcPathStr}
            fill="none"
            stroke={config.color}
            strokeWidth={STROKE_W + 3}
            strokeLinecap="round"
            filter="url(#gaugeShadow)"
          />
        )}

        {/* Zone tick marks */}
        {tickAngles.map((angleDeg, i) => {
          const inner = pt(CX, CY, R - STROKE_W / 2 - 3, angleDeg);
          const outer = pt(CX, CY, R + STROKE_W / 2 + 3, angleDeg);
          return (
            <line
              key={i}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="white"
              strokeWidth={2.5}
            />
          );
        })}

        {/* Gauge end labels */}
        <text
          x={pt(CX, CY, R + 14, 180).x - 4}
          y={pt(CX, CY, R + 14, 180).y + 4}
          textAnchor="middle"
          style={{ fontSize: "9px", fill: "#94a3b8", fontWeight: 500 }}
        >
          0
        </text>
        <text
          x={pt(CX, CY, R + 14, 0).x + 4}
          y={pt(CX, CY, R + 14, 0).y + 4}
          textAnchor="middle"
          style={{ fontSize: "9px", fill: "#94a3b8", fontWeight: 500 }}
        >
          100
        </text>

        {/* Needle */}
        <line
          x1={CX}
          y1={CY}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={config.color}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#gaugeShadow)"
        />
        <circle
          cx={CX}
          cy={CY}
          r={9}
          fill={config.color}
          filter="url(#gaugeShadow)"
        />
        <circle cx={CX} cy={CY} r={4.5} fill="white" />

        {/* Score number */}
        <text
          x={CX}
          y={CY + 48}
          textAnchor="middle"
          style={{
            fontSize: "44px",
            fontWeight: 800,
            fill: config.color,
            letterSpacing: "-2px",
          }}
        >
          {displayScore}
        </text>
        <text
          x={CX}
          y={CY + 68}
          textAnchor="middle"
          style={{
            fontSize: "11px",
            fill: "#94a3b8",
            fontWeight: 500,
            letterSpacing: "0.06em",
          }}
        >
          DENIAL RISK / 100
        </text>
      </svg>

      {/* Risk label */}
      <div
        className="mt-7 px-5 py-1.5 rounded-full"
        style={{
          backgroundColor: config.bg,
          color: config.textColor,
          fontSize: "0.85rem",
          fontWeight: 700,
        }}
      >
        {config.label}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-5 flex-wrap justify-center">
        {[
          { label: "Low", color: "#16a34a" },
          { label: "Moderate", color: "#ca8a04" },
          { label: "Elevated", color: "#ea580c" },
          { label: "High", color: "#dc2626" },
        ].map((z) => (
          <div key={z.label} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: z.color }}
            />
            <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
              {z.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
