import type { Asset } from '../components/ui/types';
import { formatAddress, formatAmount } from './format';

export type ActivityEventKind =
  | 'created'
  | 'funded'
  | 'claimed'
  | 'paused'
  | 'resumed'
  | 'cancelled'
  | 'fundsAdded'
  | 'recipientChanged'
  | 'milestoneReleased'
  | 'rewardSent'
  | 'winnerPaid'
  | 'finished'
  | 'updated';

export type ActivityObjectKind =
  | 'stream'
  | 'payment'
  | 'airdrop'
  | 'grant'
  | 'bounty'
  | 'rewardProgram'
  | 'vault'
  | 'budgetPlan'
  | 'batch';

export type ActivityParty = { address?: string; name?: string; isYou?: boolean };

export type ActivityEvent = {
  id: string;
  kind: ActivityEventKind;
  /**
   * `owner` is who runs the object (a bounty's or reward program's creator). Payouts are stored with the
   * person paid as `actor`, so `winnerPaid` and `rewardSent` name the owner as the one who paid.
   */
  object: { kind: ActivityObjectKind; name?: string; owner?: ActivityParty };
  at: number;
  actor?: ActivityParty;
  amount?: { value: string | number; asset: Asset };
  counterparty?: ActivityParty;
  txid?: string;
};

export const EVENT_WORD: Record<ActivityEventKind, string> = {
  created: 'Created',
  funded: 'Funded',
  claimed: 'Claimed',
  paused: 'Paused',
  resumed: 'Resumed',
  cancelled: 'Cancelled',
  fundsAdded: 'Funds added',
  recipientChanged: 'Recipient changed',
  milestoneReleased: 'Milestone released',
  rewardSent: 'Reward sent',
  winnerPaid: 'Winner paid',
  finished: 'Finished',
  updated: 'Updated',
};

const OBJECT_NOUN: Record<ActivityObjectKind, string> = {
  stream: 'stream',
  payment: 'recurring payment',
  airdrop: 'airdrop',
  grant: 'grant',
  bounty: 'bounty',
  rewardProgram: 'reward program',
  vault: 'vault',
  budgetPlan: 'budget plan',
  batch: 'batch',
};

const STORED_KIND: Record<string, ActivityEventKind> = {
  created: 'created',
  funded: 'funded',
  claim: 'claimed',
  claimed: 'claimed',
  paused: 'paused',
  resumed: 'resumed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  refilled: 'fundsAdded',
  transferred: 'recipientChanged',
  release: 'milestoneReleased',
  released: 'milestoneReleased',
  milestone_released: 'milestoneReleased',
  distribute: 'rewardSent',
  distributed: 'rewardSent',
  distribution: 'rewardSent',
  completed: 'finished',
};

/** A bounty stores paying its winner as a claim by the winner, so it reads as a payout there. */
export function toEventKind(stored: string | null | undefined, objectKind?: ActivityObjectKind): ActivityEventKind {
  const key = (stored ?? '').trim().toLowerCase();
  const kind = Object.prototype.hasOwnProperty.call(STORED_KIND, key) ? STORED_KIND[key] : 'updated';
  return objectKind === 'bounty' && kind === 'claimed' ? 'winnerPaid' : kind;
}

/** The payer and the person paid for a payout event, whether or not the object names its owner. */
function payout(event: ActivityEvent): { payer: string; paid: string | null } {
  const owner = event.object.owner;
  const paidParty = event.counterparty ?? (owner ? event.actor : undefined);
  return {
    payer: partyName(owner ?? event.actor, 'start'),
    paid: paidParty ? partyName(paidParty, 'middle') : null,
  };
}

function partyName(party: ActivityParty | undefined, position: 'start' | 'middle'): string {
  if (party?.isYou) return position === 'start' ? 'You' : 'you';
  if (party?.name) return party.name;
  if (party?.address) return formatAddress(party.address);
  return position === 'start' ? 'Someone' : 'someone';
}

function objectName(object: ActivityEvent['object']): string {
  return object.name ?? `this ${OBJECT_NOUN[object.kind]}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function describeEvent(event: ActivityEvent): string {
  const actor = partyName(event.actor, 'start');
  const target = objectName(event.object);
  const amount = event.amount ? formatAmount(event.amount.value, event.amount.asset) : null;
  const counterparty = event.counterparty ? partyName(event.counterparty, 'middle') : null;

  switch (event.kind) {
    case 'created':
      return `${actor} created ${target}`;
    case 'funded':
      return amount ? `${actor} funded ${target} with ${amount}` : `${actor} funded ${target}`;
    case 'claimed':
      return amount ? `${actor} claimed ${amount}` : `${actor} made a claim`;
    case 'paused':
      return `${actor} paused ${target}`;
    case 'resumed':
      return `${actor} resumed ${target}`;
    case 'cancelled':
      return amount ? `${actor} cancelled ${target} and got ${amount} back` : `${actor} cancelled ${target}`;
    case 'fundsAdded':
      return amount ? `${actor} added ${amount} to ${target}` : `${actor} added funds to ${target}`;
    case 'recipientChanged':
      return counterparty
        ? `${actor} changed the recipient to ${counterparty}`
        : `${actor} changed the recipient`;
    case 'milestoneReleased':
      return amount ? `${actor} released a milestone of ${amount}` : `${actor} released a milestone`;
    case 'rewardSent': {
      const { payer, paid } = payout(event);
      if (amount && paid) return `${payer} sent a ${amount} reward to ${paid}`;
      return amount ? `${payer} sent a ${amount} reward` : `${payer} sent a reward`;
    }
    case 'winnerPaid': {
      const { payer, paid } = payout(event);
      if (amount && paid) return `${payer} paid ${amount} to ${paid}`;
      if (paid) return `${payer} paid ${paid}`;
      return amount ? `${payer} paid a winner ${amount}` : `${payer} paid a winner`;
    }
    case 'finished':
      return `${capitalize(target)} finished`;
    case 'updated':
      return `${capitalize(target)} was updated`;
  }
}
