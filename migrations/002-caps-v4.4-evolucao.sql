-- CAPS v4.4: staging for explicit self-declared preferences, not messages from users.
CREATE TABLE IF NOT EXISTS hyron_preference_candidates (
 personality_id TEXT NOT NULL CHECK(personality_id IN ('basilisco','bicuco','garra-de-prata','bunga')),
 category TEXT NOT NULL,
 preference_key TEXT NOT NULL,
 candidate_value TEXT NOT NULL,
 last_observed_day TEXT NOT NULL,
 distinct_days INTEGER NOT NULL DEFAULT 1 CHECK(distinct_days BETWEEN 1 AND 100),
 PRIMARY KEY(personality_id,category,preference_key)
);
