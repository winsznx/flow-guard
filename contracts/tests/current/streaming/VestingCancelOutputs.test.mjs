import { expect } from 'chai';
import { Contract, MockNetworkProvider, SignatureTemplate, TransactionBuilder, randomUtxo, utils } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Output layouts StreamCancelService builds for VestingCovenant.cancel() and
// HybridVestingCovenant.cancel(), run through the real VM against the deployed artifacts.
// The case that matters most is a cancel before anything is released: VestingCovenant
// then checks output[0] as the sender's unvested part, while HybridVestingCovenant checks
// output[1] and leaves output[0] free. The streams here started a day ago and haven't
// reached their first step or unlock yet.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadArtifact = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, `../../../artifacts/streaming/${name}.json`), 'utf8'));

const NON_FINAL = 0xfffffffe;
const FEE = 4000n;
const RESERVE = 50_000n;
const DAY = 86_400n;
const CANCELABLE = 0x01;
const TOTAL = 1_000_000n;

const senderKey = Uint8Array.from(Buffer.from('11'.repeat(32), 'hex'));
const sender = new SignatureTemplate(senderKey);
const senderPubkey = sender.getPublicKey();
const senderHash = utils.hash160(senderPubkey);
const recipientHash = Uint8Array.from(Buffer.from('33'.repeat(20), 'hex'));
const p2pkh = (hash) => Uint8Array.from(Buffer.from(`76a914${Buffer.from(hash).toString('hex')}88ac`, 'hex'));
const senderLock = p2pkh(senderHash);
const recipientLock = p2pkh(recipientHash);
const category = 'ab'.repeat(32);

function stateCommitment(cursor) {
  const buffer = Buffer.alloc(40);
  buffer.writeUInt8(0, 0);
  buffer.writeUInt8(CANCELABLE, 1);
  buffer.writeBigUInt64LE(0n, 2);
  let remaining = cursor;
  for (let index = 0; index < 5; index += 1) {
    buffer[10 + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  Buffer.from(recipientHash).copy(buffer, 20);
  return buffer.toString('hex');
}

const now = BigInt(Math.floor(Date.now() / 1000));
const locktime = Number(now - 7200n);

const STEP = 7n * DAY;

function vestingStream(startTimestamp, schedule = 'linear') {
  const provider = new MockNetworkProvider();
  const step = schedule === 'step';
  const contract = new Contract(loadArtifact('VestingCovenant'), [
    '00'.repeat(32),
    senderHash,
    step ? 2n : 1n,
    TOTAL,
    startTimestamp,
    startTimestamp + 28n * DAY,
    0n,
    step ? STEP : 0n,
    step ? TOTAL / 4n : 0n,
  ], { provider });
  const utxo = randomUtxo({
    satoshis: TOTAL + RESERVE,
    token: { category, amount: 0n, nft: { capability: 'mutable', commitment: stateCommitment(startTimestamp) } },
  });
  return { provider, contract, utxo };
}

function hybridStream(startTimestamp) {
  const provider = new MockNetworkProvider();
  const contract = new Contract(loadArtifact('HybridVestingCovenant'), [
    '00'.repeat(32),
    senderHash,
    TOTAL,
    startTimestamp,
    startTimestamp + 10n * DAY,
    startTimestamp + 30n * DAY,
    TOTAL / 4n,
  ], { provider });
  const utxo = randomUtxo({
    satoshis: TOTAL + RESERVE,
    token: { category, amount: 0n, nft: { capability: 'mutable', commitment: stateCommitment(startTimestamp) } },
  });
  return { provider, contract, utxo };
}

function cancel({ provider, contract, utxo }, outputs) {
  const builder = new TransactionBuilder({ provider })
    .setLocktime(locktime)
    .addInput(utxo, contract.unlock.cancel(sender, senderPubkey), { sequence: NON_FINAL });
  for (const output of outputs) builder.addOutput(output);
  return builder;
}

describe('VestingCovenant cancel() output order', function () {
  this.timeout(30_000);

  it('accepts a cancel before the first step with the unvested part to the sender at output[0] and change at output[1]', () => {
    const stream = vestingStream(now - DAY, 'step');
    const builder = cancel(stream, [
      { to: senderLock, amount: TOTAL },
      { to: senderLock, amount: RESERVE - FEE },
    ]);
    expect(() => builder.debug()).to.not.throw();
  });

  it('rejects the old layout with a recipient placeholder at output[0]', () => {
    const stream = vestingStream(now - DAY, 'step');
    const builder = cancel(stream, [
      { to: recipientLock, amount: 546n },
      { to: senderLock, amount: TOTAL },
    ]);
    expect(() => builder.debug()).to.throw();
  });

  it('accepts a split cancel with the recipient at output[0] and the sender at output[1]', () => {
    const start = now - 10n * DAY;
    const stream = vestingStream(start);
    const elapsed = BigInt(locktime) - start;
    const vested = (TOTAL * elapsed) / (28n * DAY);
    const builder = cancel(stream, [
      { to: recipientLock, amount: vested },
      { to: senderLock, amount: TOTAL - vested },
    ]);
    expect(() => builder.debug()).to.not.throw();
  });
});

describe('HybridVestingCovenant cancel() before the unlock', function () {
  this.timeout(30_000);

  it('accepts the sender change at the unchecked output[0] and the unvested part at output[1]', () => {
    const stream = hybridStream(now - DAY);
    const builder = cancel(stream, [
      { to: senderLock, amount: RESERVE - FEE },
      { to: senderLock, amount: TOTAL },
    ]);
    expect(() => builder.debug()).to.not.throw();
  });

  it('rejects the unvested part at output[0]', () => {
    const stream = hybridStream(now - DAY);
    const builder = cancel(stream, [
      { to: senderLock, amount: TOTAL },
      { to: senderLock, amount: RESERVE - FEE },
    ]);
    expect(() => builder.debug()).to.throw();
  });
});
