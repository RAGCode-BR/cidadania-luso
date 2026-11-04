-- Execute no SQL Editor de um projeto Supabase exclusivo da Luso.
-- Também substitui a política antiga sem login, preservando os dados existentes.

create table if not exists public.luso_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.luso_workspace (
  id integer primary key check (id = 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.luso_workspace add column if not exists updated_by uuid references auth.users(id);

insert into public.luso_workspace (id, state) values (1, '{"version":2,"products":[],"attendances":[],"crm":{"opportunities":[],"activities":[],"sales":[],"stageLabels":{"prospecting":"Em prospecção","waiting":"Aguardando retorno","negotiating":"Em negociação","won":"Venda realizada","lost":"Sem negócio"},"stageOrder":["prospecting","waiting","negotiating","won","lost"]}}'::jsonb)
on conflict (id) do nothing;

alter table public.luso_members enable row level security;
alter table public.luso_workspace enable row level security;

drop policy if exists "Leitura compartilhada sem login" on public.luso_workspace;
drop policy if exists "Membro consulta seu cadastro" on public.luso_members;
drop policy if exists "Membros ativos consultam o sistema" on public.luso_workspace;

create policy "Membro consulta seu cadastro" on public.luso_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Membros ativos consultam o sistema" on public.luso_workspace
  for select to authenticated using (exists (
    select 1 from public.luso_members m
    where m.user_id = (select auth.uid()) and m.active
  ));

revoke all on public.luso_workspace from public, anon;
revoke all on public.luso_members from public, anon;
grant select on public.luso_members to authenticated;
grant select on public.luso_workspace to authenticated;

-- A atualização é serializada no banco e rejeita revisões antigas.
create or replace function public.luso_save_workspace(expected_revision bigint, next_state jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare new_revision bigint;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.luso_members
    where user_id = (select auth.uid()) and active
  ) then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;
  if next_state is null or jsonb_typeof(next_state) <> 'object'
     or pg_catalog.octet_length(next_state::text) > 10000000 then
    raise exception 'Estado inválido ou maior que 10 MB' using errcode = '22023';
  end if;
  update public.luso_workspace
  set state = next_state, revision = revision + 1,
      updated_at = pg_catalog.now(), updated_by = (select auth.uid())
  where id = 1 and revision = expected_revision
  returning revision into new_revision;
  if new_revision is null then
    raise exception 'Os dados foram alterados por outra pessoa' using errcode = '40001';
  end if;
  return new_revision;
end;
$$;

revoke all on function public.luso_save_workspace(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.luso_save_workspace(bigint, jsonb) to authenticated;

-- Para receber atualizações em outras abas e computadores.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'luso_workspace'
  ) then
    alter publication supabase_realtime add table public.luso_workspace;
  end if;
end $$;

-- Gestão de usuários: administradores criam e excluem contas pela página Usuários
-- (Edge Function luso-users). Contas novas recebem senha temporária e precisam
-- definir a própria senha no primeiro acesso.
alter table public.luso_members add column if not exists login text;
alter table public.luso_members add column if not exists is_admin boolean not null default false;
alter table public.luso_members add column if not exists must_change_password boolean not null default false;
update public.luso_members m set login = split_part(u.email, '@', 1)
  from auth.users u where u.id = m.user_id and m.login is null;

create or replace function public.luso_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.luso_members
    where user_id = (select auth.uid()) and active and is_admin
  );
$$;
revoke all on function public.luso_is_admin() from public, anon;
grant execute on function public.luso_is_admin() to authenticated;

drop policy if exists "Administradores consultam a equipe" on public.luso_members;
create policy "Administradores consultam a equipe" on public.luso_members
  for select to authenticated using ((select public.luso_is_admin()));
