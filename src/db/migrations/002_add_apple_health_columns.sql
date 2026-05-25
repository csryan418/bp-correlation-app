-- Add source tracking to blood pressure readings
ALTER TABLE blood_pressure ADD COLUMN source TEXT;

-- Add daily step count from Apple Health
ALTER TABLE daily_summary ADD COLUMN steps INTEGER;
