-- ============================================================================
-- Bootstrap the first administrator WITHOUT a local environment.
--
-- `scripts/create-first-admin.ts` is the normal route, but it needs .env.local.
-- This is the dashboard-only equivalent, for deploying straight to Vercel.
--
-- Run it AFTER 0001_init.sql, and AFTER creating the auth user in the UI.
-- ============================================================================

-- ----------------------------------------------------------------- step 1
-- In the Supabase dashboard: Authentication -> Users -> "Add user"
--   Email    : <username>@internal.lapor      e.g. hans@internal.lapor
--   Password : pick a strong one, write it down
--   ✅ tick "Auto Confirm User"
--
-- The address is synthetic. Nothing is ever sent to it, and the user never
-- sees it — they log in with the username part only.
--
-- The dashboard uses the admin API, so this still works with
-- "Allow new users to sign up" turned OFF. That is intended: an admin
-- creating an account is not the same thing as a stranger registering.

-- ----------------------------------------------------------------- step 2
-- Edit the email below to match, then run this whole block.
-- It links the auth user to a profile row and makes them an admin.

insert into public.profiles (id, username, full_name, role, is_active, created_by)
select
  u.id,
  split_part(u.email, '@', 1),   -- 'hans@internal.lapor' -> 'hans'
  null,
  'admin',
  true,
  null                            -- no creator: this account predates the rest
from auth.users u
where u.email = 'CHANGE_ME@internal.lapor'    -- <<< EDIT THIS LINE
on conflict (id) do update
  set role = 'admin',
      is_active = true;

-- ----------------------------------------------------------------- step 3
-- Confirm it worked. Expect exactly one row, role 'admin', is_active true.

select p.username, p.role, p.is_active, u.email, u.email_confirmed_at
from public.profiles p
join auth.users u on u.id = p.id;

-- If this returns no rows, the email in step 2 does not match the user you
-- created in step 1. Check for a typo and run step 2 again.
--
-- If email_confirmed_at is null, you missed "Auto Confirm User". Fix it with:
--   update auth.users set email_confirmed_at = now()
--   where email = 'CHANGE_ME@internal.lapor';
-- Without it, login fails with the same generic message as a wrong password.

-- ----------------------------------------------------------------- after
-- Every later account is created from /admin/users inside the app, where the
-- creator is recorded in profiles.created_by. This script exists only to solve
-- the chicken-and-egg problem of the very first one.
