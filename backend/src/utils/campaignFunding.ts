import { hexToBin } from '@bitauth/libauth';
import type { ConstructorArgument } from 'cashscript';
import { ContractFactory, type ContractType } from '../services/ContractFactory.js';
import { getRequiredContractFundingSatoshis, getTokenFundingSatoshis, type FundingModule } from './fundingConfig.js';

// Every spend the contract pays for itself costs one network fee (the covenants cap
// it at 5000; builders use 4000), and a token payout also takes 1000 sats of dust.
const CONTRACT_SPEND_FEE_SATOSHIS = 4000n;
const TOKEN_PAYOUT_DUST_SATOSHIS = 1000n;
const STATE_DUST_SATOSHIS = 546n;

export type CampaignKind = 'airdrop' | 'bounty' | 'reward' | 'grant';

const BASE_TYPE: Record<CampaignKind, ContractType> = {
  airdrop: 'AirdropCovenant',
  bounty: 'BountyCovenant',
  reward: 'RewardCovenant',
  grant: 'GrantCovenant',
};

function decodeArgs(raw: string | null | undefined): ConstructorArgument[] {
  const parsed = JSON.parse(raw || '[]') as Array<{ type?: string; value?: unknown }>;
  return parsed.map((param) => {
    if (param?.type === 'bytes') return hexToBin(String(param.value));
    if (param?.type === 'bigint') return BigInt(String(param.value));
    if (param?.type === 'boolean') return param.value === true || param.value === 'true';
    return param?.value as ConstructorArgument;
  });
}

/**
 * Spends a V2 campaign pays from its own reserve: airdrop claims (the claimer needs
 * no BCH), grant releases, and pause, resume, change of recipient and cancel. Bounty
 * and reward payouts are paid by the creator's wallet.
 */
function contractPaidSpends(kind: CampaignKind, row: any): { spends: number; tokenPayouts: number } {
  const controls = kind === 'grant' ? 4 : 3;
  if (kind === 'airdrop') {
    const perClaim = Number(row.amount_per_claim || 0);
    const claims = perClaim > 0 ? Math.ceil(Number(row.total_amount || 0) / perClaim) : 0;
    return { spends: claims + controls, tokenPayouts: claims };
  }
  if (kind === 'grant') {
    const releases = Number(row.milestones_total || 0);
    return { spends: releases + controls, tokenPayouts: releases };
  }
  return { spends: controls, tokenPayouts: 0 };
}

/**
 * BCH the contract output must hold at funding. A V2 contract gets a reserve sized
 * for every spend it pays for, and returns what's left on cancel. A V1 contract keeps
 * the flat reserve, because its cancel can't return more than 5000 sats of it.
 */
export function campaignContractSatoshis(kind: CampaignKind, row: any, principalOnChain: bigint): bigint {
  const tokenType = String(row.token_type || 'BCH').toUpperCase() === 'BCH' ? 'BCH' : 'FUNGIBLE_TOKEN';
  const module: FundingModule = 'airdrop';
  const base = BASE_TYPE[kind];
  const type = row.contract_address
    ? ContractFactory.typeForAddress(base, decodeArgs(row.constructor_params), row.contract_address)
    : ContractFactory.latest(base);
  if (!ContractFactory.isV2(type)) {
    return getRequiredContractFundingSatoshis(module, tokenType, principalOnChain);
  }

  const { spends, tokenPayouts } = contractPaidSpends(kind, row);
  const reserve = BigInt(spends) * CONTRACT_SPEND_FEE_SATOSHIS
    + (tokenType === 'FUNGIBLE_TOKEN' ? BigInt(tokenPayouts) * TOKEN_PAYOUT_DUST_SATOSHIS : 0n)
    + STATE_DUST_SATOSHIS;
  const floor = getRequiredContractFundingSatoshis(module, tokenType, 0n);
  const sized = reserve > floor ? reserve : floor;
  if (tokenType === 'FUNGIBLE_TOKEN') {
    const configured = getTokenFundingSatoshis(module);
    return sized > configured ? sized : configured;
  }
  return principalOnChain + sized;
}
