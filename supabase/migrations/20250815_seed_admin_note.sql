-- Zorg dat jouw profiel bestaat (als je al eerder een account had)
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where u.email = 'cjvanvulpen@outlook.com' and p.id is null;

-- Zet jouw rol op admin
update public.profiles
set role = 'admin', updated_at = now()
where email = 'cjvanvulpen@outlook.com';
