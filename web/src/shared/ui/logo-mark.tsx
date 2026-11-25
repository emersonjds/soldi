const DOTS = [
  { cx: 70, cy: 16, r: 6 },
  { cx: 52, cy: 30, r: 8 },
  { cx: 59, cy: 50, r: 10 },
  { cx: 74, cy: 69, r: 11.5 },
  { cx: 38, cy: 80, r: 14 },
];

export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
    {DOTS.map(({ cx, cy, r }, index) => (
      <circle key={cx} cx={cx} cy={cy} r={r} fill={`var(--logo-${index + 1})`} />
    ))}
  </svg>
);
