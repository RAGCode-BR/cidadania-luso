-- Execute uma vez no SQL Editor de um projeto Supabase exclusivo da Luso.
-- ATENÇÃO: sem autenticação, qualquer pessoa com o endpoint e a chave pública
-- poderá ler e alterar todos os registros. Use apenas para dados de avaliação.

create table if not exists public.luso_workspace (
  id integer primary key check (id = 1),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

insert into public.luso_workspace (id, state) values (1, '{"version":1,"products":[],"works":[],"contacts":[],"visits":[],"plans":[],"crm":{"opportunities":[],"activities":[],"sales":[],"visitLinks":[],"stageLabels":{"prospecting":"Em prospecção","waiting":"Aguardando retorno","negotiating":"Em negociação","won":"Venda realizada","lost":"Sem negócio"},"stageOrder":["prospecting","waiting","negotiating","won","lost"]},"services":[],"installers":[],"serviceDecisions":{},"nextInstallationNumber":1,"serviceHistory":[],"serviceHistoryImports":[]}'::jsonb)
on conflict (id) do nothing;

alter table public.luso_workspace enable row level security;

create policy "Leitura compartilhada sem login" on public.luso_workspace
  for select to anon, authenticated using (true);

revoke all on public.luso_workspace from public;
grant select on public.luso_workspace to anon, authenticated;

-- A atualização é serializada no banco e rejeita revisões antigas.
create or replace function public.luso_save_workspace(expected_revision bigint, next_state jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare new_revision bigint;
begin
  if next_state is null or jsonb_typeof(next_state) <> 'object'
     or pg_catalog.octet_length(next_state::text) > 10000000 then
    raise exception 'Estado inválido ou maior que 10 MB' using errcode = '22023';
  end if;
  update public.luso_workspace
  set state = next_state, revision = revision + 1,
      updated_at = pg_catalog.now()
  where id = 1 and revision = expected_revision
  returning revision into new_revision;
  if new_revision is null then
    raise exception 'Os dados foram alterados por outra pessoa' using errcode = '40001';
  end if;
  return new_revision;
end;
$$;

revoke all on function public.luso_save_workspace(bigint, jsonb) from public;
grant execute on function public.luso_save_workspace(bigint, jsonb) to anon, authenticated;

-- Para receber atualizações em outras abas e computadores.
alter publication supabase_realtime add table public.luso_workspace;
