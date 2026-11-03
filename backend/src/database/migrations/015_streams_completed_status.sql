-- Migration 015: finished streams were left ACTIVE.
--
-- POST /streams/:id/confirm-claim only added to withdrawn_amount, so a fixed-schedule
-- stream whose last claim released everything stayed ACTIVE: lists and the detail page
-- showed it as running and offered pause and cancel, which the covenant then rejects.
-- confirm-claim now sets COMPLETED. This marks the rows that finished before that fix.
-- Refillable streams stay open until cancelled. Data only. Safe to re-run.

BEGIN;

UPDATE streams
SET status = 'COMPLETED',
    updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
WHERE status = 'ACTIVE'
  AND COALESCE(refillable, 0) = 0
  AND total_amount > 0
  AND withdrawn_amount >= total_amount * (1 - 1e-9);

COMMIT;
