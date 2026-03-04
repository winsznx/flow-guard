import { Card } from '../ui/Card';
import { type DaoWorkspaceProposal } from '../../stores/useDaoWorkspace';

interface DaoProposalStageChartProps {
  proposals: DaoWorkspaceProposal[];
}

const stageTone = {
  Draft: 'bg-surface text-textMuted',
  Review: 'bg-secondary/10 text-secondary',
  Queued: 'bg-accent/10 text-accent',
  Ready: 'bg-primary/10 text-primary',
} as const;

export function DaoProposalStageChart({ proposals }: DaoProposalStageChartProps) {
  const counts = ['Draft', 'Review', 'Queued', 'Ready'].map((stage) => ({
    stage,
    count: proposals.filter((proposal) => proposal.stage === stage).length,
  }));
  const maxCount = Math.max(...counts.map((item) => item.count), 1);

  return (
    <Card padding="lg" className="border-border/40">
      <div className="mb-5">
        <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Proposal Pipeline</p>
        <h2 className="mt-2 font-display text-2xl text-textPrimary">Treasury action flow</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map((item) => (
          <div key={item.stage} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-[0.18em] ${stageTone[item.stage as keyof typeof stageTone]}`}>
                {item.stage}
              </span>
              <span className="font-display text-2xl text-textPrimary">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-primarySoft/60">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
