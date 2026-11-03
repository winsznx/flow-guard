import { ArrowUpRight, Icon } from './Icon';
import { Tooltip } from './Tooltip';
import { ACTIONS } from '../../copy/common';
import { EXPLORER_NAME } from '../../copy/network';
import { getExplorerTxUrl } from '../../utils/blockchain';

export type TxLinkProps = {
  txid: string;
  network: 'mainnet' | 'chipnet';
  /** What the transaction was, such as the activity line, so a list of links can be told apart. */
  context?: string;
};

const SHORT_TXID = 8;

export function TxLink({ txid, network, context }: TxLinkProps) {
  const destination = `Opens ${EXPLORER_NAME[network]}`;
  const which = context ? ` for ${context}` : ` ${txid.slice(0, SHORT_TXID)}`;

  return (
    <Tooltip content={destination}>
      <a
        href={getExplorerTxUrl(txid, network)}
        target="_blank"
        rel="noopener noreferrer"
        data-control
        className="inline-flex items-center gap-1 text-small text-brand underline underline-offset-4 transition-colors duration-(--duration-fast) ease-standard hover:text-brand-hover"
      >
        {ACTIONS.viewTransaction}
        <span className="sr-only">
          {which}. {destination} in a new tab
        </span>
        <Icon icon={ArrowUpRight} size={16} />
      </a>
    </Tooltip>
  );
}
