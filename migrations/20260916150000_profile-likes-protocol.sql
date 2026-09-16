-- Profile likes never persisted: the function speaks a newer protocol than the table.
--
-- tokentracker-profile-likes counts and deletes by an `id` column, writes
-- is_authenticated, and stores anonymous likers as text identifiers
-- (`anon_<uuid>` for browsers, `compat_<uuid>` for the legacy delta protocol).
-- The table had none of that — no id, no is_authenticated, liker_id was a uuid with
-- a foreign key to auth.users — so reads answered 500 and every write failed. The
-- long-running production database had the same old shape, so this was never
-- working upstream either; no migration in this repo adds the columns.
--
-- Every statement is idempotent so this can be applied to a live database.

alter table public.tokentracker_profile_likes
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists is_authenticated boolean not null default false;

-- The foreign key must go before the type change: Postgres refuses to retype a
-- column a foreign key depends on, and liker_id now holds text ids as well as uuids.
alter table public.tokentracker_profile_likes
  drop constraint if exists tokentracker_profile_likes_liker_id_fkey;

alter table public.tokentracker_profile_likes
  alter column liker_id type text using liker_id::text;

-- The primary key moves to id. (target_user_id, liker_id) stays unique so the same
-- liker cannot be counted twice — the function documents that the constraint is the
-- only thing preventing double counting for legacy callers.
alter table public.tokentracker_profile_likes
  drop constraint if exists tokentracker_profile_likes_pkey;

alter table public.tokentracker_profile_likes
  add constraint tokentracker_profile_likes_pkey primary key (id);

create unique index if not exists tokentracker_profile_likes_target_liker_key
  on public.tokentracker_profile_likes (target_user_id, liker_id);

-- Adding columns leaves PostgREST serving its cached schema, which makes every
-- write fail with "Could not find the '...' column ... in the schema cache".
notify pgrst, 'reload schema';

-- Verify: like, read back, unlike, read back. Expect
--   {count:1, liked:true} then {count:0, liked:false}
-- POST /functions/tokentracker-profile-likes
--   {"target_user_id":"<uuid>","action":"like","anon_id":"<uuid>"}.
