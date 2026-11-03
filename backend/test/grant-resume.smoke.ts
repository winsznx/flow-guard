/**
 * Smoke test: GrantControlService.buildResumeTransaction builds the transaction
 * GrantCovenant.resume() accepts.
 *
 * resume() (contracts GrantCovenant.cash) requires: status byte == 1, at most one output,
 * output commitment = 0x00 + commitment[1..35] + 0x00000000, same token category,
 * locking bytecode and token amount, and a fee of 0..5000 sats out of the contract.
 *
 * The contract is built offline from the real artifact (GrantDeploymentService) and
 * `ElectrumNetworkProvider.getUtxos` is stubbed with a paused state UTXO. Signing and
 * broadcast need a live wallet on chipnet, so they are not covered here.
 *
 * Also mounts the real grants router with `pool.query` stubbed and checks that
 * confirm-resume and confirm-pause only accept the tx that created the live state UTXO,
 * with the right status byte, and only from PAUSED / ACTIVE respectively. Before, any
 * tx paying the contract (the funding tx, the pause tx) flipped the DB status, even for
 * CANCELLED or COMPLETED grants.
 *
 * NO network, NO database:
 *
 *   pnpm --filter @flowguard/backend exec tsx test/grant-resume.smoke.ts
 */

import express from 'express';
import type { AddressInfo } from 'node:net';
import { ElectrumNetworkProvider, type Utxo } from 'cashscript';
import {
  binToHex,
  cashAddressToLockingBytecode,
  encodeTransaction,
  hashTransaction,
  hexToBin,
  type TransactionCommon,
} from '@bitauth/libauth';
import { GrantDeploymentService } from '../src/services/GrantDeploymentService.js';
import { GrantControlService } from '../src/services/GrantControlService.js';

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean): void {
  console.log(condition ? 'PASS' : 'FAIL', name);
  if (condition) pass++;
  else fail++;
}

const deployment = await new GrantDeploymentService('chipnet').deployGrantWithHash({
  vaultId: '11'.repeat(32),
  authorityHash: '22'.repeat(20),
  recipientHash: '33'.repeat(20),
  milestonesTotal: 3,
  amountPerMilestone: 0.001,
  totalAmount: 0.003,
  cancelable: true,
  tokenType: 'BCH',
});

const constructorParams = deployment.constructorParams.map((param) => (
  param.type === 'bytes' ? hexToBin(String(param.value)) : BigInt(String(param.value))
));

function stateCommitment(status: number): Uint8Array {
  const commitment = hexToBin(deployment.initialCommitment);
  commitment[0] = status;
  commitment[2] = 1; // one milestone paid
  commitment[3] = 0xa0; // total_released low byte
  commitment[11] = 0x55; // last_release_timestamp low byte
  commitment.fill(0xee, 36); // reserved bytes the covenant zeroes
  return commitment;
}

const CATEGORY = 'cd'.repeat(32);
const CONTRACT_SATS = 300_000n + 5_000n;
let stubCommitment = stateCommitment(1);
let stubStateTxid = 'ab'.repeat(32);

ElectrumNetworkProvider.prototype.getUtxos = async function getUtxos(): Promise<Utxo[]> {
  return [{
    txid: stubStateTxid,
    vout: 0,
    satoshis: CONTRACT_SATS,
    token: {
      category: CATEGORY,
      amount: 0n,
      nft: { capability: 'mutable', commitment: binToHex(stubCommitment) },
    },
  }];
};

const service = new GrantControlService('chipnet');
const params = {
  contractAddress: deployment.contractAddress,
  constructorParams,
  currentCommitment: binToHex(stubCommitment),
  currentTime: Math.floor(Date.now() / 1000),
  tokenType: 'BCH' as const,
  feePayerAddress: 'bchtest:qcreator',
};

const built = await service.buildResumeTransaction(params);
const { transaction, sourceOutputs, userPrompt } = built.wcTransaction;
const output = transaction.outputs[0];
const outCommitment = output?.token?.nft?.commitment;
const before = stateCommitment(1);

check('nextStatus is ACTIVE', built.nextStatus === 'ACTIVE');
check('single input, single output', transaction.inputs.length === 1 && transaction.outputs.length === 1);
check('lock time 0', transaction.locktime === 0);
check('input sequence is final', transaction.inputs[0].sequenceNumber === 0xffffffff);
check('output commitment is 40 bytes', outCommitment instanceof Uint8Array && outCommitment.length === 40);
if (outCommitment instanceof Uint8Array) {
  check('status byte set to 0 (ACTIVE)', outCommitment[0] === 0);
  check('bytes 1-35 kept', binToHex(outCommitment.slice(1, 36)) === binToHex(before.slice(1, 36)));
  check('bytes 36-39 zeroed', binToHex(outCommitment.slice(36)) === '00000000');
}
check('output keeps token category', binToHex(output.token?.category ?? new Uint8Array()) === CATEGORY);
check('output goes back to the contract', binToHex(output.lockingBytecode) === binToHex(sourceOutputs[0].lockingBytecode));
const fee = CONTRACT_SATS - output.valueSatoshis;
check('fee is within the covenant cap (0..5000)', fee >= 0n && fee <= 5000n);
check('wallet prompt is plain', userPrompt === 'Resume this grant');
const sourceContract = (sourceOutputs[0] as { contract?: { abiFunction?: { name?: string } } }).contract;
check('unlocks with resume()', sourceContract?.abiFunction?.name === 'resume');

stubCommitment = stateCommitment(0);
let activeRefused = false;
try {
  await service.buildResumeTransaction({ ...params, currentCommitment: binToHex(stubCommitment) });
} catch (error) {
  activeRefused = error instanceof Error && error.message === 'Grant must be PAUSED to resume';
}
check('refuses to resume an ACTIVE grant', activeRefused);

process.env.DATABASE_URL ??= 'postgres://stub:stub@127.0.0.1:1/stub';
const { pool } = await import('../src/database/pg.js');
const { issueBearer } = await import('../src/middleware/auth.js');
const { default: grantsRouter } = await import('../src/api/grants.js');

const GRANT_ID = '11111111-2222-4333-8444-555555555555';
const CREATOR = 'bchtest:qcreator';
let grantStatus = 'PAUSED';
let statusWrites: string[] = [];

pool.query = (async (sql: string, params: unknown[] = []) => {
  if (/FROM grants WHERE id = /i.test(sql)) {
    return {
      rows: [{ id: GRANT_ID, creator: CREATOR, status: grantStatus, contract_address: deployment.contractAddress }],
      rowCount: 1,
    };
  }
  if (/UPDATE grants SET status = /i.test(sql)) {
    statusWrites.push(String(params[0]));
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}) as unknown as typeof pool.query;

const contractLocking = cashAddressToLockingBytecode(deployment.contractAddress);
if (typeof contractLocking === 'string') throw new Error(contractLocking);
const chain = new Map<string, string>();

function stateTx(status: number, salt: number): string {
  const transaction: TransactionCommon = {
    version: 2,
    locktime: 0,
    inputs: [{
      outpointTransactionHash: new Uint8Array(32).fill(salt),
      outpointIndex: 0,
      sequenceNumber: 0xffffffff,
      unlockingBytecode: new Uint8Array(),
    }],
    outputs: [{
      lockingBytecode: (contractLocking as { bytecode: Uint8Array }).bytecode,
      valueSatoshis: 300_000n,
      token: {
        category: hexToBin(CATEGORY),
        amount: 0n,
        nft: { capability: 'mutable', commitment: stateCommitment(status) },
      },
    }],
  };
  const raw = encodeTransaction(transaction);
  const txid = hashTransaction(raw);
  chain.set(txid, binToHex(raw));
  return txid;
}

ElectrumNetworkProvider.prototype.getRawTransaction = async function getRawTransaction(txid: string): Promise<string> {
  const raw = chain.get(txid);
  if (!raw) throw new Error('No such mempool or blockchain transaction');
  return raw;
};

const fundingTx = stateTx(0, 1);
const pauseTx = stateTx(1, 2);
const resumeTx = stateTx(0, 3);

const app = express();
app.use(express.json());
app.use('/api', grantsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', () => resolve()));
const { port } = server.address() as AddressInfo;
const { token } = issueBearer({
  address: CREATOR,
  pubkeyHex: '02'.padEnd(66, '0'),
  pubkeyHash: '00'.repeat(20),
  authenticatedAt: Date.now(),
});

async function confirm(action: 'pause' | 'resume', txHash: string): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/api/grants/${GRANT_ID}/confirm-${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ txHash }),
  });
  await response.json();
  return response.status;
}

try {
  for (const terminal of ['CANCELLED', 'COMPLETED']) {
    grantStatus = terminal;
    stubStateTxid = fundingTx;
    stubCommitment = stateCommitment(0);
    check(`confirm-resume refuses a ${terminal} grant (409)`, await confirm('resume', fundingTx) === 409);
    check(`confirm-pause refuses a ${terminal} grant (409)`, await confirm('pause', fundingTx) === 409);
  }
  check('terminal grants were never rewritten', statusWrites.length === 0);

  grantStatus = 'PAUSED';
  stubStateTxid = pauseTx;
  stubCommitment = stateCommitment(1);
  check('confirm-resume refuses the funding tx (400)', await confirm('resume', fundingTx) === 400);
  check('confirm-resume refuses the pause tx while the chain is still paused (400)', await confirm('resume', pauseTx) === 400);
  check('confirm-resume refuses a resume tx that is not the live state (400)', await confirm('resume', resumeTx) === 400);
  check('no status written for refused resumes', statusWrites.length === 0);

  stubStateTxid = resumeTx;
  stubCommitment = stateCommitment(0);
  check('confirm-resume accepts the tx that created the ACTIVE live state (200)', await confirm('resume', resumeTx) === 200);
  check('confirm-resume wrote ACTIVE', statusWrites.join(',') === 'ACTIVE');

  statusWrites = [];
  grantStatus = 'ACTIVE';
  check('confirm-pause refuses a tx that is not the live state (400)', await confirm('pause', pauseTx) === 400);
  check('confirm-pause refuses the live ACTIVE state (400)', await confirm('pause', resumeTx) === 400);
  stubStateTxid = pauseTx;
  stubCommitment = stateCommitment(1);
  check('confirm-pause accepts the tx that created the PAUSED live state (200)', await confirm('pause', pauseTx) === 200);
  check('confirm-pause wrote PAUSED', statusWrites.join(',') === 'PAUSED');
} finally {
  server.close();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
