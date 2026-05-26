interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}

export function StatTile({ label, value, subtitle, accent = false }: StatTileProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <p className="text-zinc-500 text-[10px] uppercase tracking-wider">{label}</p>
      <p
        className={`text-xl font-semibold mt-1 tabular-nums truncate ${
          accent ? 'text-amber-400' : 'text-zinc-100'
        }`}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-zinc-500 text-xs mt-1 truncate">{subtitle}</p>
      )}
    </div>
  );
}
