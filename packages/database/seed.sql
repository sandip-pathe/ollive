-- Minimal seed data for local dev
INSERT INTO users (id, display_name) VALUES (gen_random_uuid(), 'Dev User');

-- create a sample conversation and messages
INSERT INTO conversations (id, title, status) VALUES (gen_random_uuid(), 'Sample convo', 'active');

