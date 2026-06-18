/**
 * Deployment API endpoints
 * Provides endpoints for contract deployment and verification
 */

import { resolveBchNetwork } from '../utils/network.js';
import { Router } from 'express';
import { ContractService } from '../services/contract-service.js';
import { DeploymentRegistryService } from '../services/DeploymentRegistryService.js';

const router = Router();

const SUPPORTED_NETWORKS = new Set(['mainnet', 'testnet3', 'testnet4', 'chipnet']);

function getNetwork(raw: unknown): 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' {
  const candidate = String(raw || 'chipnet');
  if (SUPPORTED_NETWORKS.has(candidate)) {
    return candidate as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';
  }
  return 'chipnet';
}

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

    const contractService = new ContractService(resolveBchNetwork());

    const deployment = await contractService.deployVault({
      signerPubkeys: [signer1, signer2, signer3],
      requiredApprovals: approvalThreshold,
      periodDuration: cycleDuration,
      periodCap: spendingCap,
      recipientCap: 0,
      allowlistEnabled: false,
    });

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

    const contractService = new ContractService(resolveBchNetwork());
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

/**
 * GET /api/deployment/registry
 * Return all known contract deployments + verification status.
 */
router.get('/registry', async (req, res) => {
  try {
    const network = getNetwork(req.query.network);
    const verifyOnChain = String(req.query.verifyOnChain ?? 'true').toLowerCase() !== 'false';

    const registryService = new DeploymentRegistryService(network);
    const report = await registryService.buildReport({ verifyOnChain });
    const problematic = report.entries.filter((entry) =>
      !entry.contractAddress ||
      entry.addressMatchesCurrentArtifact === false ||
      entry.hasOnChainEvidence === false ||
      entry.constructorParamsPresent === false,
    );

    res.json({
      success: true,
      ...report,
      problematicCount: problematic.length,
      problematic,
    });
  } catch (error: any) {
    console.error('Deployment registry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build deployment registry',
      message: error.message,
    });
  }
});

export default router;
