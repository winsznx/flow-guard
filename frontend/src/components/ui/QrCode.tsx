import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QR_COLORS } from '../../styles/tokens';
import { QR_CAPTION, QR_FRAME } from './classes';

export type QrCodeProps = { value: string; caption: string; size?: 160 | 200 | 240 };

type Drawn = { value: string; size: number; url: string | null };

const DRAW_FAILED = "Couldn't draw the QR code. Copy the link instead.";

export function QrCode({ value, caption, size = 200 }: QrCodeProps) {
  const [drawn, setDrawn] = useState<Drawn | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: QR_COLORS.dark, light: QR_COLORS.light },
    })
      .then((url) => {
        if (!cancelled) setDrawn({ value, size, url });
      })
      .catch((error: unknown) => {
        console.warn('QR code could not be drawn', error);
        if (!cancelled) setDrawn({ value, size, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  const current = drawn && drawn.value === value && drawn.size === size ? drawn : null;
  const box = { width: size, height: size };

  return (
    <figure className="inline-flex flex-col items-center gap-3">
      <div className={QR_FRAME}>
        {current?.url ? (
          <img src={current.url} width={size} height={size} alt={caption} className="block" />
        ) : current ? (
          <p style={box} className="flex items-center justify-center text-center text-small text-ink-secondary">
            {DRAW_FAILED}
          </p>
        ) : (
          <span role="status" style={box} className="block animate-pulse rounded-inline bg-sunken">
            <span className="sr-only">Loading</span>
          </span>
        )}
      </div>
      <figcaption className={QR_CAPTION}>{caption}</figcaption>
    </figure>
  );
}
