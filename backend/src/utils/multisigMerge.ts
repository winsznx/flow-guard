import {
  binToHex,
  decodeAuthenticationInstructions,
  decodeTransaction,
  encodeAuthenticationInstructions,
  encodeTransaction,
  hexToBin,
  type AuthenticationInstruction,
} from '@bitauth/libauth';

const PLACEHOLDER_SIGNATURE = '00'.repeat(65);

function pushData(instruction: AuthenticationInstruction | undefined): Uint8Array | null {
  return instruction && 'data' in instruction ? instruction.data : null;
}

function decodeUnlocking(bytecode: Uint8Array): AuthenticationInstruction[] {
  const instructions = decodeAuthenticationInstructions(bytecode);
  if (instructions.some((instruction) => 'malformed' in instruction && instruction.malformed)) {
    throw new Error('Unlocking bytecode is malformed');
  }
  return instructions as AuthenticationInstruction[];
}

/**
 * Builds the final multisig spend from the template unlocking bytecode and each signer's copy.
 *
 * The template unlocking bytecode (the contract input's, as the wallets received it in
 * the source outputs) carries a placeholder signature next to each signer's
 * public key. A wallet fills every placeholder with its own signature, so each slot
 * takes its signature from the copy signed by the key in that slot. Signatures cover
 * the transaction, not the unlocking bytecode, so they combine into one valid input.
 */
export function mergeMultisigSignatures(
  templateUnlockingHex: string,
  signedBy: Array<{ pubkey: string; transactionHex: string }>,
  inputIndex = 0,
): string {
  if (signedBy.length === 0) throw new Error('No signed copies to merge');
  const templateInstructions = decodeUnlocking(hexToBin(templateUnlockingHex));

  const signedInstructions = new Map<string, AuthenticationInstruction[]>();
  for (const signer of signedBy) {
    const decoded = decodeTransaction(hexToBin(signer.transactionHex));
    if (typeof decoded === 'string') throw new Error(`Signed transaction is unreadable: ${decoded}`);
    signedInstructions.set(signer.pubkey.toLowerCase(), decodeUnlocking(decoded.inputs[inputIndex].unlockingBytecode));
  }

  let filled = 0;
  const merged = templateInstructions.map((instruction, index) => {
    const data = pushData(instruction);
    if (!data || binToHex(data) !== PLACEHOLDER_SIGNATURE) return instruction;
    const slotPubkey = pushData(templateInstructions[index - 1]);
    if (!slotPubkey || slotPubkey.length !== 33) {
      throw new Error('Signature slot is not next to a public key');
    }
    const signerCopy = signedInstructions.get(binToHex(slotPubkey));
    if (!signerCopy) throw new Error(`No signature from ${binToHex(slotPubkey)}`);
    const signature = signerCopy[index];
    const signatureData = pushData(signature);
    if (!signatureData || binToHex(signatureData) === PLACEHOLDER_SIGNATURE) {
      throw new Error(`Signer ${binToHex(slotPubkey)} left its signature slot empty`);
    }
    filled += 1;
    return signature;
  });
  if (filled === 0) throw new Error('Template has no signature slots');

  const final = decodeTransaction(hexToBin(signedBy[0].transactionHex));
  if (typeof final === 'string') throw new Error(`Signed transaction is unreadable: ${final}`);
  final.inputs[inputIndex].unlockingBytecode = encodeAuthenticationInstructions(merged);
  return binToHex(encodeTransaction(final));
}
