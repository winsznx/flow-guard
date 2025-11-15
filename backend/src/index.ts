import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import vaultsRouter from './api/vaults';
import proposalsRouter from './api/proposals';
import cyclesRouter from './api/cycles';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flowguard-backend' });
});

// API routes
app.use('/api/vaults', vaultsRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api', cyclesRouter);

app.get('/api', (req, res) => {
  res.json({ message: 'FlowGuard API', version: '0.1.0' });
});

app.listen(PORT, () => {
  console.log(`🚀 FlowGuard backend running on port ${PORT}`);
});

