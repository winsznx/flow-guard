// MUST be first: materialises `globalThis.Buffer` and a minimal `process`
// shim before any other module runs. Replaces vite-plugin-node-polyfills.
import './polyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { TransactionNoticeToast } from './components/ui/TransactionNoticeToast';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <TransactionNoticeToast>
            <App />
          </TransactionNoticeToast>
        </BrowserRouter>
      </MotionConfig>
    </HelmetProvider>
  </React.StrictMode>
);

