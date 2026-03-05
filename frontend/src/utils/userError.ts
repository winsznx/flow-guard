export interface UserFacingError {
  message: string;
  details?: string;
}

const DIAGNOSTICS_MARKER = '\n\nDiagnostics:';

function cleanMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^Error:\s*/i, '');
}

export function toUserFacingError(error: unknown, fallback: string): UserFacingError {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';

  const cleaned = cleanMessage(raw);
  if (!cleaned) {
    return { message: fallback };
  }

  const markerIndex = cleaned.indexOf(DIAGNOSTICS_MARKER);
  const withSeparatedDiagnostics = markerIndex >= 0
    ? {
        message: cleanMessage(cleaned.slice(0, markerIndex)),
        details: cleanMessage(cleaned.slice(markerIndex + DIAGNOSTICS_MARKER.length)),
      }
    : { message: cleaned };

  const messageLower = withSeparatedDiagnostics.message.toLowerCase();
  if (messageLower.includes('bad-txns-nonfinal') || messageLower.includes('non-final transaction')) {
    return {
      message: 'Transaction is not final yet. Please wait a few seconds and try again.',
      details: withSeparatedDiagnostics.details || withSeparatedDiagnostics.message,
    };
  }

  const singleLineMessage = withSeparatedDiagnostics.message.split('\n')[0].trim();
  if (singleLineMessage.length > 220) {
    return {
      message: `${singleLineMessage.slice(0, 220)}...`,
      details: withSeparatedDiagnostics.details || withSeparatedDiagnostics.message,
    };
  }

  return {
    message: singleLineMessage || fallback,
    details: withSeparatedDiagnostics.details,
  };
}
