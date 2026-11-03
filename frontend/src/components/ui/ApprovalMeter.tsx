import { Check, Icon } from './Icon';
import { cx } from './cx';
import { formatAddress, formatShortId } from '../../copy/format';
import { LABELS, needsApprovals } from '../../copy/common';

export type Signer = ({ address: string; publicKey?: string } | { address?: string; publicKey: string }) & {
  name?: string;
  approved: boolean;
};

export type ApprovalMeterProps = { required: number; signers: Signer[] };

function signerKey(signer: Signer): string {
  return signer.address ?? signer.publicKey ?? '';
}

function signerMachineId(signer: Signer): string {
  return signer.address ? formatAddress(signer.address, 'short') : formatShortId(signer.publicKey ?? '');
}

export function ApprovalMeter({ required, signers }: ApprovalMeterProps) {
  const approved = signers.filter((signer) => signer.approved).length;
  const ordered = [...signers.filter((signer) => signer.approved), ...signers.filter((signer) => !signer.approved)];
  const needs = needsApprovals(required);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-label text-ink">
          {approved} of {signers.length} {signers.length === 1 ? 'signer' : 'signers'} approved
        </span>
        <span className="text-small text-ink-muted">{needs}</span>
      </div>
      <div aria-hidden="true" className="flex h-2 gap-0.5">
        {ordered.map((signer) => (
          <span
            key={signerKey(signer)}
            className={cx(
              'h-full flex-1 rounded-pill',
              signer.approved ? 'bg-brand' : 'bg-sunken bg-(image:--pattern-hatch) border border-line-control',
            )}
          />
        ))}
      </div>
      <ul className="flex flex-col">
        {signers.map((signer) => (
          <li key={signerKey(signer)} className="flex items-center justify-between gap-4 border-t border-line py-2 first:border-t-0">
            <span className="flex min-w-0 flex-col">
              {signer.name ? <span className="text-body text-ink">{signer.name}</span> : null}
              <span className={cx('text-small', signer.name ? 'text-ink-muted' : 'text-ink')}>{signerMachineId(signer)}</span>
            </span>
            {signer.approved ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-small text-success-ink">
                <Icon icon={Check} size={16} />
                {LABELS.approved}
              </span>
            ) : (
              <span className="shrink-0 text-small text-ink-muted">{LABELS.waiting}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
