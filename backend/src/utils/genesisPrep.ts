/**
 * Genesis UTXO Preparation
 * Creates a self-spending WC transaction that produces a vout=0 UTXO,
 * required for CashTokens genesis (token category creation).
 */

import { ElectrumNetworkProvider, type WcTransactionObject } from 'cashscript';
import { buildFundingWcTransaction } from './wcFundingBuilder.js';
import { toNonNegativeBigInt } from './bigint.js';

export interface GenesisPrepResult {
    required: boolean;
    wcTransaction?: WcTransactionObject;
}

export async function checkAndPrepareGenesisUtxo(
    provider: ElectrumNetworkProvider,
    address: string,
): Promise<GenesisPrepResult> {
    const utxos = await provider.getUtxos(address);
    if (!utxos || utxos.length === 0) {
        return { required: false };
    }

    const nonTokenUtxos = utxos.filter((utxo: any) => !utxo.token);
    const hasVout0 = nonTokenUtxos.some((utxo: any) => utxo.vout === 0);

    if (hasVout0) {
        return { required: false };
    }

    let totalInputValue = 0n;
    const selectedUtxos = [];
    const feeEstimate = 400n;

    for (const utxo of nonTokenUtxos) {
        selectedUtxos.push(utxo);
        totalInputValue += toNonNegativeBigInt(utxo.satoshis, 'prep input satoshis');
        if (totalInputValue >= feeEstimate + 546n) {
            break;
        }
    }

    if (totalInputValue < feeEstimate + 546n) {
        return { required: false };
    }

    const changeAmount = totalInputValue - feeEstimate;

    const sourceOutputs = selectedUtxos.map((utxo: any) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: Number(toNonNegativeBigInt(utxo.satoshis, 'source satoshis')),
    }));

    const outputs = [
        {
            to: address,
            amount: changeAmount.toString(),
        },
    ];

    const wcTransaction = buildFundingWcTransaction({
        inputOwnerAddress: address,
        inputs: sourceOutputs,
        outputs,
        userPrompt: 'Get your wallet ready to fund. This sends BCH back to your own wallet.',
    });

    return {
        required: true,
        wcTransaction,
    };
}
