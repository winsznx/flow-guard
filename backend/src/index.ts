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

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://flowguard-delta.vercel.app'
    ];

    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Allow any Vercel preview deployment
    if (origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-address'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
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

