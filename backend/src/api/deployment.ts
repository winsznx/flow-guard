/**
 * Deployment API endpoints
 * Provides endpoints for contract deployment and verification
 */

import { Router } from 'express';
import { ContractService } from '../services/contract-service';

const router = Router();

/**
 * POST /api/deployment/deploy
 * Deploy a new contract to chipnet
 */
router.post('/deploy', async (req, res) => {
  try {
    const {
      signer1,
      signer2,
      signer3,
      approvalThreshold = 2,
      cycleDuration = 2592000, // 30 days
      spendingCap = 100000000, // 1 BCH
    } = req.body;

    if (!signer1 || !signer2 || !signer3) {
      return res.status(400).json({ error: 'All three signer public keys are required' });
    }

    const contractService = new ContractService('chipnet');
    const vaultStartTime = Math.floor(Date.now() / 1000);

    const deployment = await contractService.deployVault(
      signer1,
      signer2,
      signer3,
      approvalThreshold,
      0, // Initial state
      cycleDuration,
      vaultStartTime,
      spendingCap
    );

    // Check balance
    const balance = await contractService.getBalance(deployment.contractAddress);
    const utxos = await contractService.getUTXOs(deployment.contractAddress);

    res.json({
      success: true,
      contract: {
        address: deployment.contractAddress,
        contractId: deployment.contractId,
        bytecode: deployment.bytecode,
      },
      status: {
        balance: balance,
        balanceBCH: balance / 100000000,
        utxoCount: utxos.length,
        funded: balance > 0,
      },
      funding: {
        required: !(balance > 0),
        address: deployment.contractAddress,
        faucet: 'https://tbch.googol.cash/',
        explorer: `https://chipnet.imaginary.cash/address/${deployment.contractAddress}`,
      },
    });
  } catch (error: any) {
    console.error('Deployment error:', error);
    res.status(500).json({
      error: 'Deployment failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/deployment/verify/:address
 * Verify a deployed contract
 */
router.get('/verify/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const contractService = new ContractService('chipnet');
    const balance = await contractService.getBalance(address);
    const utxos = await contractService.getUTXOs(address);
    const blockHeight = await contractService.getBlockHeight();

    res.json({
      address,
      network: 'chipnet',
      status: {
        balance: balance,
        balanceBCH: balance / 100000000,
        utxoCount: utxos.length,
        funded: balance > 0,
        blockHeight,
      },
      utxos: utxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
        height: utxo.height,
        confirmed: utxo.height !== undefined,
      })),
      explorer: `https://chipnet.imaginary.cash/address/${address}`,
    });
  } catch (error: any) {
    console.error('Verification error:', error);
    res.status(500).json({
      error: 'Verification failed',
      message: error.message,
    });
  }
});

export default router;

