const DUST_DEFAULT = 1000n;
const TOKEN_FUNDING_DEFAULT = 20_000n;
const MIN_TOKEN_FUNDING = 546n;
const STATEFUL_CONTRACT_RESERVE = 546n;

function parsePositiveIntEnv(value: string | undefined): bigint | null {
  if (!value || value.trim().length === 0) return null;
  if (!/^\d+$/.test(value.trim())) return null;
  return BigInt(value.trim());
}

export type FundingModule = 'payment' | 'stream' | 'budget' | 'airdrop';

const MODULE_ENV_KEYS: Record<FundingModule, string> = {
  payment: 'PAYMENT_TOKEN_CONTRACT_SATOSHIS',
  stream: 'STREAM_TOKEN_CONTRACT_SATOSHIS',
  budget: 'BUDGET_TOKEN_CONTRACT_SATOSHIS',
  airdrop: 'AIRDROP_TOKEN_CONTRACT_SATOSHIS',
};

/**
 * Token-bearing outputs need BCH to remain standard and cover relay fee.
 * This value is configurable globally or per funding module.
 */
export function getTokenFundingSatoshis(module: FundingModule): bigint {
  const moduleSpecific = parsePositiveIntEnv(process.env[MODULE_ENV_KEYS[module]]);
  const globalValue = parsePositiveIntEnv(process.env.TOKEN_CONTRACT_SATOSHIS);
  const configured = moduleSpecific ?? globalValue ?? TOKEN_FUNDING_DEFAULT;
  return configured < MIN_TOKEN_FUNDING ? MIN_TOKEN_FUNDING : configured;
}

export function getTokenOutputDustSatoshis(): bigint {
  const configured = parsePositiveIntEnv(process.env.TOKEN_OUTPUT_DUST_SATOSHIS) ?? DUST_DEFAULT;
  return configured < 546n ? 546n : configured;
}

export function getStatefulContractReserveSatoshis(): bigint {
  return STATEFUL_CONTRACT_RESERVE;
}

export function getRequiredContractFundingSatoshis(
  module: FundingModule,
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN' | undefined,
  principalSatoshis: bigint,
): bigint {
  return tokenType === 'FUNGIBLE_TOKEN'
    ? getTokenFundingSatoshis(module)
    : principalSatoshis + getStatefulContractReserveSatoshis();
}
