-- Migration 016: grant columns the API uses.
--
-- POST /grants/create inserts grant_number and the frontend reads it, but tables created
-- from postgres-schema.sql only had campaign_id (NOT NULL), so every grant create failed.
-- Create now writes the same reference to both columns. Mirrored in postgres-schema.sql
-- (applied at boot). Safe to re-run.

BEGIN;

ALTER TABLE grants
    ADD COLUMN IF NOT EXISTS grant_number TEXT,
    ADD COLUMN IF NOT EXISTS campaign_id TEXT;

UPDATE grants SET grant_number = campaign_id WHERE grant_number IS NULL AND campaign_id IS NOT NULL;

-- Milestones had the same split: the API uses milestone_index and created_at.
ALTER TABLE grant_milestones
    ADD COLUMN IF NOT EXISTS milestone_index INTEGER,
    ADD COLUMN IF NOT EXISTS milestone_number INTEGER,
    ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS created_at BIGINT;

UPDATE grant_milestones SET milestone_index = milestone_number WHERE milestone_index IS NULL AND milestone_number IS NOT NULL;

COMMIT;
