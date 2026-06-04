-- Add times as JSON array column to supplements table
-- e.g. ["morning", "afternoon"]
ALTER TABLE supplements ADD COLUMN times TEXT NOT NULL DEFAULT '["morning"]';

-- Migrate existing time_of_day values to the new times column
UPDATE supplements SET times = json_array(time_of_day);

-- Keep time_of_day column for backwards compatibility
-- but it becomes the PRIMARY time (first in the array)

-- Data fix: Fish oil (8), Primal Queen (4), Creatine (11) take both morning and afternoon
UPDATE supplements SET times = '["morning","afternoon"]', time_of_day = 'morning' WHERE id IN (4, 8, 11);
