import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import vaultsRouter from './api/vaults';
import proposalsRouter from './api/proposals';
import cyclesRouter from './api/cycles';
import { startBlockchainMonitor, stopBlockchainMonitor } from './services/blockchain-monitor';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - Allow all Vercel deployments
app.use(cors({
  origin: true, // Allow all origins for now (can restrict later)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-address'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flowguard-backend', blockchain: 'connected' });
});

// API routes
app.use('/api/vaults', vaultsRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api', cyclesRouter);

app.get('/api', (req, res) => {
  res.json({ message: 'FlowGuard API', version: '0.1.0', network: 'chipnet' });
});

app.listen(PORT, () => {
  console.log(`🚀 FlowGuard backend running on port ${PORT}`);
  console.log(`📡 Network: ${process.env.BCH_NETWORK || 'chipnet'}`);

  // Start blockchain monitoring (check every 30 seconds)
  console.log('🔗 Starting blockchain monitor...');
  startBlockchainMonitor(30000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  stopBlockchainMonitor();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  stopBlockchainMonitor();
  process.exit(0);
});

