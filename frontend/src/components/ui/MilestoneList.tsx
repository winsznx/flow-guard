import { Amount } from './Amount';
import { Button } from './Button';
import { List } from './List';
import type { Column } from './ListTable';
import { StatusPill } from './StatusPill';
import type { Asset } from './types';
import type { StatusKey } from '../../copy/status';
import { formatAmount } from '../../copy/format';

type MilestoneStatus = 'pending' | 'released' | 'cancelled';

type Milestone = { id: string; title: string; amount: string; status: MilestoneStatus };

export type MilestoneListProps = {
  asset: Asset;
  milestones: Milestone[];
  onRelease?: (id: string) => void;
};

type Row = Milestone & { number: number };

const STATUS_KEY: Record<MilestoneStatus, StatusKey> = {
  pending: 'notReleased',
  released: 'paid',
  cancelled: 'cancelled',
};

const LIST_LABEL = 'Milestones';
const MIN_TABLE_WIDTH = 560;
const EMPTY = 'No milestones yet.';

export function MilestoneList({ asset, milestones, onRelease }: MilestoneListProps) {
  const rows: Row[] = milestones.map((milestone, index) => ({ ...milestone, number: index + 1 }));
  const nextId = onRelease ? rows.find((row) => row.status === 'pending')?.id : undefined;

  const columns: Column<Row>[] = [
    { key: 'number', header: 'No.', cell: (row) => row.number, mobile: 'bottom-start' },
    { key: 'title', header: 'Milestone', cell: (row) => row.title, primary: true, mobile: 'top' },
    {
      key: 'amount',
      header: 'Amount',
      cell: (row) => <Amount value={row.amount} asset={asset} />,
      align: 'end',
      mobile: 'bottom-end',
    },
    { key: 'status', header: 'Status', cell: (row) => <StatusPill status={STATUS_KEY[row.status]} size="sm" />, mobile: 'bottom-start' },
  ];

  const empty = <p className="px-4 py-6 text-small text-ink-secondary">{EMPTY}</p>;

  return (
    <List
      label={LIST_LABEL}
      minTableWidth={MIN_TABLE_WIDTH}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      rowAction={
        onRelease
          ? (row) =>
              row.id === nextId ? (
                <Button variant="primary" size="sm" onClick={() => onRelease(row.id)}>
                  {`Release ${formatAmount(row.amount, asset) ?? ''}`.trim()}
                </Button>
              ) : null
          : undefined
      }
      state={rows.length === 0 ? 'empty' : 'ready'}
      empty={empty}
      noResults={empty}
      error={empty}
    />
  );
}
