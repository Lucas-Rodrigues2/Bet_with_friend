-- Seed file for local development & E2E tests
-- Run via: npm run db:reset (= supabase db reset)
--
-- Users de test (email/password, déjà confirmés)
-- Mot de passe commun : test-password-123
-- Les hashes bcrypt correspondent à "test-password-123"

-- ─── Users de test dans auth.users ────────────────────────────────────────────
-- Note: on insère directement dans auth.users pour les tests, en bypassant le
-- flux d'inscription normal (email déjà confirmé pour les tests E2E).

INSERT INTO auth.users (
  id,
  instance_id,
  role,
  aud,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token,
  is_sso_user,
  is_anonymous
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alice@test.local',
    crypt('test-password-123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"pseudo":"Alice"}',
    now(), now(), '', '', '', '', false, false
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'bob@test.local',
    crypt('test-password-123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"pseudo":"Bob"}',
    now(), now(), '', '', '', '', false, false
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'carol@test.local',
    crypt('test-password-123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"pseudo":"Carol"}',
    now(), now(), '', '', '', '', false, false
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'dave@test.local',
    crypt('test-password-123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"pseudo":"Dave"}',
    now(), now(), '', '', '', '', false, false
  )
ON CONFLICT (id) DO NOTHING;

-- identities pour permettre la connexion email/password
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"alice@test.local"}',
    'email',
    'alice@test.local',
    now(), now(), now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"bob@test.local"}',
    'email',
    'bob@test.local',
    now(), now(), now()
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","email":"carol@test.local"}',
    'email',
    'carol@test.local',
    now(), now(), now()
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","email":"dave@test.local"}',
    'email',
    'dave@test.local',
    now(), now(), now()
  )
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ─── Profils dans public.profiles ─────────────────────────────────────────────
-- Créés manuellement (normalement déclenchés par un trigger ou l'action signup)

INSERT INTO public.profiles (id, pseudo, is_anonymous, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', false, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob',   false, now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Carol', false, now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Dave',  false, now())
ON CONFLICT (id) DO NOTHING;

-- ─── Groupe de test seedé ─────────────────────────────────────────────────────
-- "Les potes du test" — Alice admin, Bob et Carol membres

INSERT INTO public.groups (id, name, description, currency, creator_id, created_at) VALUES
  (
    '11111111-1111-1111-8111-111111111111',
    'Les potes du test',
    'Groupe seedé pour les tests E2E',
    'EUR',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    now()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.group_members (group_id, user_id, role, joined_at) VALUES
  ('11111111-1111-1111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin',  now()),
  ('11111111-1111-1111-8111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', now()),
  ('11111111-1111-1111-8111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member', now())
ON CONFLICT (group_id, user_id) DO NOTHING;

-- Dave n'est pas dans le groupe seedé (utile pour tester l'isolation)

-- ─── Bucket Storage : avatars ─────────────────────────────────────────────────
-- Bucket public, lecture sans auth, écriture server-side (service role)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
