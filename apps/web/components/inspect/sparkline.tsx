"use client";

export default function Sparkline({ data = [], width = 120, height = 28, stroke = '#6f685e' }: { data?: number[]; width?: number; height?: number; stroke?: string }) {
  if (!data || data.length === 0) {
    return <svg width={width} height={height} />;
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const len = data.length;
  const points = data.map((v, i) => {
    const x = len === 1 ? width / 2 : (i / (len - 1)) * width;
    const y = height - ((v - min) / Math.max(1, (max - min))) * height;
    return `${x},${y}`;
  }).join(' ');
  const last = data[data.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={stroke} strokeWidth={1.5} points={points} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={len === 1 ? width / 2 : (width * (len - 1)) / (len - 1)} cy={height - ((last - min) / Math.max(1, (max - min))) * height} r={2.2} fill={stroke} />
    </svg>
  );
}
