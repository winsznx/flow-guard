-- Migration 012: point stream_claims.stream_id at streams.id (the UUID).
--
-- POST /streams/:id/confirm-claim used to write the logical id (#FG-BCH-001)
-- into stream_claims.stream_id, while GET /streams/:id reads claims by the UUID,
-- so claim history always came back empty. New claims now store the UUID, and the
-- read path accepts either form until this backfill has run.
--
-- Not applied at boot (init.ts only runs postgres-schema.sql). An operator runs it
-- by hand. Safe to re-run: rows already holding a UUID match no logical id.

BEGIN;

UPDATE stream_claims sc
   SET stream_id = s.id
  FROM streams s
 WHERE sc.stream_id = s.stream_id
   AND sc.stream_id <> s.id;

COMMIT;
