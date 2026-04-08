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

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

function getLabelRadius(baseRadius: number, angleIndex: number, totalSites: number): number {
  // Keep labels closer to the circle - just enough gap
  const minRadius = baseRadius + 20;
  // Only add extra tier for dense distributions
  const tier = totalSites > 12 ? Math.floor(angleIndex / 8) : 0;
  return minRadius + tier * 14;
}

function shouldShowLabel(
  siteIndex: number,
  totalSites: number,
  sortedSites: { angle: number }[],
): boolean {
  if (totalSites === 0 || totalSites > 20) return false;

  // For sparse distributions, show all
  if (totalSites <= 6) return true;

  // For medium density, skip every other if too close
  if (totalSites <= 12) {
    const currentAngle = sortedSites[siteIndex].angle;
    const prevAngle = sortedSites[(siteIndex - 1 + totalSites) % totalSites].angle;
    const nextAngle = sortedSites[(siteIndex + 1) % totalSites].angle;

    const angleDiff = Math.min(
      Math.abs(normalizeAngle(currentAngle - prevAngle)),
      Math.abs(normalizeAngle(nextAngle - currentAngle)),
    );

    // Only show if there's enough angular distance
    return angleDiff >= 25 || siteIndex % 2 === 0;
  }

  // For dense distributions, only show every 2nd or 3rd
  return siteIndex % 2 === 0;
}

export function CircularGenomeMap({ sequenceName, sequenceLength, enzymeName, sites }: CircularGenomeMapProps) {
  const center = 180;
  const radius = 120;
  const innerRadius = 102;

  const displayName = truncateText(sequenceName, 26);
  const nameClassName =
    sequenceName.length > 34
      ? 'genome-map-center-name genome-map-center-name--small'
      : sequenceName.length > 26
        ? 'genome-map-center-name genome-map-center-name--medium'
        : 'genome-map-center-name';

  // Sort sites by angle for consistent rendering
  const sortedSites = [...sites]
    .map((site) => ({
      ...site,
      angle: ((site.position - 1) / sequenceLength) * 360,
    }))
    .sort((a, b) => a.angle - b.angle);

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
        const outer = polarToCartesian(center, radius + 3, angle);
        const inner = polarToCartesian(center, radius - 1, angle);

        return <line key={angle} className="genome-map-tick" x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
      })}

      {sortedSites.map((site, index) => {
        const lineStart = polarToCartesian(center, radius - 12, site.angle);
        const lineEnd = polarToCartesian(center, radius + 12, site.angle);
        const labelRadius = getLabelRadius(radius, index, sortedSites.length);
        const labelPoint = polarToCartesian(center, labelRadius, site.angle);

        // Calculate text-anchor based on angle to keep text readable
        const normalizedAngle = normalizeAngle(site.angle);
        let textAnchor: 'start' | 'middle' | 'end' = 'middle';
        if (normalizedAngle > 15 && normalizedAngle < 165) {
          textAnchor = 'start';
        } else if (normalizedAngle > 195 && normalizedAngle < 345) {
          textAnchor = 'end';
        }

        const showLabel = shouldShowLabel(index, sortedSites.length, sortedSites);

        return (
          <g key={`${site.position}-${site.strand}`} className="genome-site-marker">
            <line className="genome-site-line" x1={lineStart.x} y1={lineStart.y} x2={lineEnd.x} y2={lineEnd.y} />
            <circle className="genome-site-dot" cx={lineEnd.x} cy={lineEnd.y} r="3.5" />
            {showLabel ? (
              <text
                className="genome-site-label"
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor={textAnchor}
                dy="0.35em"
              >
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
