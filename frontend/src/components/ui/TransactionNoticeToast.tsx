import React, { useEffect } from 'react';
import { ToastProvider, useToast, type ToastInput } from './Toast';
import { ACTIONS, MOMENTS, TOASTS } from '../../copy/common';
import { getExplorerTxUrl } from '../../utils/blockchain';
import { TX_NOTICE_EVENT, type TransactionNoticeDetail } from '../../utils/txNotice';
import { SIGN_IN_NOTICE_EVENT, type SignInNoticeDetail } from '../../utils/auth';

function isNoticeEvent(event: Event): event is CustomEvent<TransactionNoticeDetail> {
  return event instanceof CustomEvent && typeof event.detail?.txHash === 'string' && event.detail.txHash !== '';
}

function isSignInEvent(event: Event): event is CustomEvent<SignInNoticeDetail> {
  return event instanceof CustomEvent && typeof event.detail?.title === 'string' && typeof event.detail?.line === 'string';
}

function noticeLine(notice: TransactionNoticeDetail): string {
  const step = notice.step;
  if (step && step.index < step.of) return MOMENTS.stepOneDone;
  return MOMENTS.sentPending;
}

function TransactionNoticeBridge() {
  const { toast } = useToast();

  useEffect(() => {
    const copyId = async (txHash: string) => {
      try {
        await navigator.clipboard.writeText(txHash);
        toast({ tone: 'success', title: TOASTS.idCopied });
      } catch (error) {
        console.warn('[TransactionNoticeToast] Clipboard write failed:', error);
        toast({ tone: 'danger', title: TOASTS.copyFailed });
      }
    };

    const handleNotice = (event: Event) => {
      if (!isNoticeEvent(event)) return;
      const notice = event.detail;
      const input: ToastInput = {
        tone: 'info',
        title: notice.label?.trim() || MOMENTS.transactionSent,
        line: noticeLine(notice),
        link: { label: ACTIONS.viewTransaction, href: getExplorerTxUrl(notice.txHash, notice.network) },
        action: { label: ACTIONS.copyId, onClick: () => void copyId(notice.txHash) },
      };
      toast(input);
    };

    const handleSignIn = (event: Event) => {
      if (!isSignInEvent(event)) return;
      toast({ tone: 'info', title: event.detail.title, line: event.detail.line });
    };

    window.addEventListener(TX_NOTICE_EVENT, handleNotice);
    window.addEventListener(SIGN_IN_NOTICE_EVENT, handleSignIn);
    return () => {
      window.removeEventListener(TX_NOTICE_EVENT, handleNotice);
      window.removeEventListener(SIGN_IN_NOTICE_EVENT, handleSignIn);
    };
  }, [toast]);

  return null;
}

/**
 * The app's toast host. Wrap the app in it so any component can call useToast(), and transaction
 * notices from utils/txNotice show as info toasts: sent, not confirmed, so never a check mark. The
 * sign-in notice from utils/auth shows as an info toast just before the wallet asks to sign in.
 * Rendered without children it still hosts the transaction notices on its own.
 */
export function TransactionNoticeToast({ children }: { children?: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <TransactionNoticeBridge />
    </ToastProvider>
  );
}
