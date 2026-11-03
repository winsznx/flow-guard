// Votes on chipnet: a vault vote, a BCH stake and a token stake locked behind their
// choices, then both stakes taken back after voting closes.
//   PHASE=lock (default): VAULT_ID=<vault uuid> pnpm exec tsx test/e2e-chipnet/70-votes.ts
//   PHASE=unlock, run once voting has closed and median time past has caught up (~2.5 hours)

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TEST_TOKEN, alice, api, bob, check, expectOk, lifecycle, log, signIn, summary, type TestWallet,
} from './lib.js';

const STATE_FILE = process.env.E2E_VOTE_STATE ?? join(tmpdir(), 'flowguard-e2e-votes-state.json');

interface VoteState {
  proposalId: string;
  locks: Array<{ voter: 'alice' | 'bob'; contractAddress: string; stakeAmount: number; tokenCategory?: string }>;
}

const voters: Record<'alice' | 'bob', TestWallet> = { alice, bob };

async function phaseLock(): Promise<void> {
  const vaultId = process.env.VAULT_ID;
  if (!vaultId) throw new Error('set VAULT_ID');
  const proposal = await expectOk('vote: create', api('POST', `/api/vaults/${vaultId}/governance`, {
    as: alice,
    body: { title: 'E2E vote', description: 'Chipnet end-to-end', quorum: 0, votingDurationDays: 0.02 },
  }));
  const proposalId: string = proposal.id;
  check('vote: create returns an id', typeof proposalId === 'string', JSON.stringify(proposal).slice(0, 200));
  const state: VoteState = { proposalId, locks: [] };

  const stakes: Array<{ voter: 'alice' | 'bob'; choice: string; stakeAmount: number; tokenCategory?: string }> = [
    { voter: 'alice', choice: 'FOR', stakeAmount: 0.0002 },
    { voter: 'bob', choice: 'AGAINST', stakeAmount: 50, tokenCategory: TEST_TOKEN },
  ];
  for (const stake of stakes) {
    const w = voters[stake.voter];
    try {
      const { built } = await lifecycle({
        step: `vote: ${stake.voter} locks ${stake.tokenCategory ? 'tokens' : 'BCH'}`,
        as: w,
        build: { path: `/api/governance/${proposalId}/lock`, body: { voterAddress: w.address, voteChoice: stake.choice, stakeAmount: stake.stakeAmount, tokenCategory: stake.tokenCategory } },
        confirm: (b, txHash) => ({
          path: `/api/governance/${proposalId}/confirm-lock`,
          body: {
            voterAddress: w.address, voteChoice: stake.choice, weight: stake.stakeAmount, txHash,
            contractAddress: b.deployment.contractAddress, voteId: b.deployment.voteId,
            constructorParams: b.deployment.constructorParams, nftCommitment: b.deployment.initialCommitment,
          },
        }),
      });
      state.locks.push({ voter: stake.voter, contractAddress: built.deployment.contractAddress, stakeAmount: stake.stakeAmount, tokenCategory: stake.tokenCategory });
    } catch (error) {
      check(`vote: ${stake.voter} lock finished`, false, error instanceof Error ? error.message : String(error));
    }
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  const tally = await api('GET', `/api/governance/${proposalId}`, { as: alice });
  log('tally', JSON.stringify(tally.body).slice(0, 400));
}

async function phaseUnlock(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as VoteState;
  for (const lock of state.locks) {
    const w = voters[lock.voter];
    try {
      await lifecycle({
        step: `vote: ${lock.voter} takes the stake back`,
        as: w,
        build: { path: `/api/governance/${state.proposalId}/unlock`, body: { voterAddress: w.address, contractAddress: lock.contractAddress, stakeAmount: lock.stakeAmount, tokenCategory: lock.tokenCategory } },
        confirm: (_b, txHash) => ({ path: `/api/governance/${state.proposalId}/confirm-unlock`, body: { voterAddress: w.address, txHash } }),
      });
    } catch (error) {
      check(`vote: ${lock.voter} unlock finished`, false, error instanceof Error ? error.message : String(error));
    }
  }
}

async function main(): Promise<void> {
  for (const w of [alice, bob]) await signIn(w);
  if ((process.env.PHASE ?? 'lock') === 'unlock') await phaseUnlock();
  else await phaseLock();
  process.exit(summary() ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
