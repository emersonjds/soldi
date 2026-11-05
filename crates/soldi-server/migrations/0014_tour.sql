-- Welcome tour (SOL-27): set once by `POST /api/me/tour-seen`.
ALTER TABLE users ADD COLUMN tour_seen_at timestamptz;
