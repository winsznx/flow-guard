import { expect } from 'chai';
import { Contract, MockNetworkProvider, TransactionBuilder, randomUtxo } from 'cashscript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// RecurringPaymentCovenant.pay() can't pay out tokens, for two reasons:
//   1. line 72 compares the recipient output's tokenCategory with the input's, and the
//      input's carries the state NFT's capability byte (mutable = 0x01), so a plain
//      fungible output never matches;
//   2. lines 94-95 compute the fee as inputs[0].value - amountPerInterval - outputs[1].value
//      (must be 0..5000), subtracting a token amount from BCH.
// These run the real VM (TransactionBuilder.debug()) against the deployed artifact.
// See internal/bugfix/contract-notes/recurring-token-pay-fee.md.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../../artifacts/streaming/RecurringPaymentCovenant.json'),
  'utf8',
));

const NON_FINAL = 0xfffffffe;
const FEE = 4000n;
const TOKEN_OUTPUT_DUST = 1000n;
const INTERVAL = 86_400n;
const TOKEN_FLAGS = 0x05; // cancelable + usesTokens
const BCH_FLAGS = 0x01;

const recipientHash = '33'.repeat(20);
const recipientLockingBytecode = Uint8Array.from(Buffer.from(`76a914${recipientHash}88ac`, 'hex'));
const category = 'cd'.repeat(32);

function u40le(buffer, offset, value) {
  let remaining = BigInt(value);
  for (let index = 0; index < 5; index += 1) {
    buffer[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function commitment({ status, flags, totalPaid, paymentCount, nextPayment }) {
  const buffer = Buffer.alloc(40);
  buffer.writeUInt8(status, 0);
  buffer.writeUInt8(flags, 1);
  buffer.writeBigUInt64LE(BigInt(totalPaid), 2);
  buffer.writeBigUInt64LE(BigInt(paymentCount), 10);
  u40le(buffer, 18, nextPayment);
  return buffer.toString('hex');
}

function setup({ amountPerInterval, totalAmount, usesTokens }) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const startTimestamp = now - 10n * INTERVAL;
  const provider = new MockNetworkProvider();
  const contract = new Contract(artifact, [
    '11'.repeat(32),
    '22'.repeat(20),
    recipientHash,
    amountPerInterval,
    INTERVAL,
    totalAmount,
    startTimestamp,
    0n,
  ], { provider });
  const flags = usesTokens ? TOKEN_FLAGS : BCH_FLAGS;
  const before = commitment({ status: 0, flags, totalPaid: 0, paymentCount: 0, nextPayment: startTimestamp });
  const after = commitment({ status: 0, flags, totalPaid: amountPerInterval, paymentCount: 1, nextPayment: startTimestamp + INTERVAL });
  return { contract, provider, locktime: Number(now - 7200n), before, after };
}

// Mirrors PaymentClaimService for a token stream: 1,000-sat recipient token output,
// 4,000-sat fee from the contract, the rest stays on the state output.
function buildTokenPay(amountPerInterval) {
  const totalAmount = amountPerInterval * 10n;
  const { contract, provider, locktime, before, after } = setup({ amountPerInterval, totalAmount, usesTokens: true });
  const contractSatoshis = 20_000n;
  const utxo = randomUtxo({
    satoshis: contractSatoshis,
    token: { category, amount: totalAmount, nft: { capability: 'mutable', commitment: before } },
  });
  return new TransactionBuilder({ provider })
    .setLocktime(locktime)
    .addInput(utxo, contract.unlock.pay(), { sequence: NON_FINAL })
    .addOutput({ to: recipientLockingBytecode, amount: TOKEN_OUTPUT_DUST, token: { category, amount: amountPerInterval } })
    .addOutput({
      to: contract.tokenAddress,
      amount: contractSatoshis - TOKEN_OUTPUT_DUST - FEE,
      token: { category, amount: totalAmount - amountPerInterval, nft: { capability: 'mutable', commitment: after } },
    });
}

describe('RecurringPaymentCovenant pay() fee window', () => {
  it('accepts a BCH payment with a 4,000-sat fee', () => {
    const amountPerInterval = 100_000n;
    const { contract, provider, locktime, before, after } = setup({ amountPerInterval, totalAmount: 1_000_000n, usesTokens: false });
    const contractSatoshis = 1_000_000n + 20_000n;
    const utxo = randomUtxo({
      satoshis: contractSatoshis,
      token: { category, amount: 0n, nft: { capability: 'mutable', commitment: before } },
    });
    const builder = new TransactionBuilder({ provider })
      .setLocktime(locktime)
      .addInput(utxo, contract.unlock.pay(), { sequence: NON_FINAL })
      .addOutput({ to: recipientLockingBytecode, amount: amountPerInterval })
      .addOutput({
        to: contract.tokenAddress,
        amount: contractSatoshis - amountPerInterval - FEE,
        token: { category, amount: 0n, nft: { capability: 'mutable', commitment: after } },
      });
    expect(() => builder.debug()).to.not.throw();
  });

  it('rejects even a 1-base-unit token payment at the category check', () => {
    expect(() => buildTokenPay(1n).debug()).to.throw(/tokenCategory == tx\.inputs\[0\]\.tokenCategory/);
  });

  it('rejects a token payment above 5,000 base units', () => {
    expect(() => buildTokenPay(5_001n).debug()).to.throw();
  });

  it('rejects a typical token payment (1,000,000 base units)', () => {
    expect(() => buildTokenPay(1_000_000n).debug()).to.throw();
  });
});
