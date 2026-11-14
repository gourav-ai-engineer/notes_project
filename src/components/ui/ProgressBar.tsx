interface Props {
  value: number;
  max: number;
  label: string;
}

export function ProgressBar({ value, max, label }: Props) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
