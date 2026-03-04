import { Card } from '../ui/Card';
import { formatUsd, type DaoWorkspaceCashflowPoint } from '../../stores/useDaoWorkspace';

interface DaoCashflowChartProps {
  data: DaoWorkspaceCashflowPoint[];
}

export function DaoCashflowChart({ data }: DaoCashflowChartProps) {
  const maxValue = Math.max(...data.flatMap((point) => [point.inflow, point.outflow]), 1);

  return (
    <Card padding="lg" className="border-border/40">
      <div className="mb-5">
        <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Treasury Throughput</p>
        <h2 className="mt-2 font-display text-2xl text-textPrimary">Cash flow trend</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data.map((point) => {
          const inflowHeight = Math.max(12, (point.inflow / maxValue) * 140);
          const outflowHeight = Math.max(12, (point.outflow / maxValue) * 140);
          const net = point.inflow - point.outflow;

          return (
            <div key={point.id} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4">
              <p className="mb-4 text-xs font-mono uppercase tracking-[0.24em] text-textMuted">{point.label}</p>
              <div className="mb-4 flex h-40 items-end gap-3">
                <div className="flex-1">
                  <div
                    className="w-full rounded-t-xl bg-accent transition-all"
                    style={{ height: `${inflowHeight}px` }}
                  />
                  <p className="mt-2 text-center text-[11px] font-mono uppercase tracking-[0.18em] text-textMuted">
                    In
                  </p>
                </div>
                <div className="flex-1">
                  <div
                    className="w-full rounded-t-xl bg-primary transition-all"
                    style={{ height: `${outflowHeight}px` }}
                  />
                  <p className="mt-2 text-center text-[11px] font-mono uppercase tracking-[0.18em] text-textMuted">
                    Out
                  </p>
                </div>
              </div>
              <div className="space-y-1 text-xs font-mono text-textMuted">
                <div className="flex items-center justify-between">
                  <span>Inflow</span>
                  <span>{formatUsd(point.inflow)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Outflow</span>
                  <span>{formatUsd(point.outflow)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-textPrimary">
                  <span>Net</span>
                  <span className={net >= 0 ? 'text-primary' : 'text-error'}>{formatUsd(net)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
