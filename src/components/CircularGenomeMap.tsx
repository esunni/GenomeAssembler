import type { EnzymeSite } from '../utils/designTools';

interface CircularGenomeMapProps {
  sequenceName: string;
  sequenceLength: number;
  enzymeName: string;
  sites: EnzymeSite[];
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function polarToCartesian(center: number, radius: number, angleDegrees: number) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;

  return {
    x: center + radius * Math.cos(angleRadians),
    y: center + radius * Math.sin(angleRadians),
  };
}

export function CircularGenomeMap({ sequenceName, sequenceLength, enzymeName, sites }: CircularGenomeMapProps) {
  const center = 180;
  const radius = 120;
  const innerRadius = 102;
  const showLabels = sites.length > 0 && sites.length <= 12;
  const displayName = truncateText(sequenceName, 26);
  const nameClassName =
    sequenceName.length > 34
      ? 'genome-map-center-name genome-map-center-name--small'
      : sequenceName.length > 26
        ? 'genome-map-center-name genome-map-center-name--medium'
        : 'genome-map-center-name';

  return (
    <svg
      className="genome-map"
      viewBox="0 0 360 360"
      role="img"
      aria-label={`Circular genome map for ${sequenceName}`}
    >
      <title>{`${sequenceName} ${enzymeName} site map`}</title>

      <circle className="genome-map-ring-shadow" cx={center} cy={center} r={radius} />
      <circle className="genome-map-ring" cx={center} cy={center} r={radius} />
      <circle className="genome-map-ring-inner" cx={center} cy={center} r={innerRadius} />

      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * 30;
        const outer = polarToCartesian(center, radius + 5, angle);
        const inner = polarToCartesian(center, radius - 1, angle);

        return <line key={angle} className="genome-map-tick" x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
      })}

      {sites.map((site) => {
        const angle = ((site.position - 1) / sequenceLength) * 360;
        const lineStart = polarToCartesian(center, radius - 12, angle);
        const lineEnd = polarToCartesian(center, radius + 12, angle);
        const labelPoint = polarToCartesian(center, radius + 28, angle);

        return (
          <g key={`${site.position}-${site.strand}`} className="genome-site-marker">
            <line className="genome-site-line" x1={lineStart.x} y1={lineStart.y} x2={lineEnd.x} y2={lineEnd.y} />
            <circle className="genome-site-dot" cx={lineEnd.x} cy={lineEnd.y} r="3.5" />
            {showLabels ? (
              <text className="genome-site-label" x={labelPoint.x} y={labelPoint.y} textAnchor="middle">
                {site.position}
              </text>
            ) : null}
          </g>
        );
      })}

      <g className="genome-map-center">
        <text x={center} y={center - 30} textAnchor="middle" className={nameClassName}>
          {displayName}
        </text>
        <text x={center} y={center - 8} textAnchor="middle" className="genome-map-center-length">
          {sequenceLength.toLocaleString()} bp
        </text>
        <text x={center} y={center + 18} textAnchor="middle" className="genome-map-center-enzyme">
          {enzymeName}
        </text>
        <text x={center} y={center + 42} textAnchor="middle" className="genome-map-center-count">
          {sites.length} sites
        </text>
      </g>
    </svg>
  );
}
