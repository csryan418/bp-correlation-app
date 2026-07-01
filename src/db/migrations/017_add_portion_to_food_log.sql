-- Persist the resolved portion for new food_log rows (no backfill; old rows stay null).
-- portion_grams is PER SINGLE PORTION, not the total logged weight. Total logged
-- grams = portion_grams * serving_size, since serving_size holds the quantity
-- multiplier. This distinction matters for the later editor portion-recompute piece.
-- portion_label stores the BARE label ("1 cup", "10 goldfish"); the UI composes the
-- "1 cup (240g)" display string from both columns, so nothing denormalized is stored.
ALTER TABLE food_log ADD COLUMN portion_grams REAL;
ALTER TABLE food_log ADD COLUMN portion_label TEXT;
