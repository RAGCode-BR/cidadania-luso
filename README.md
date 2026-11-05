# Luso — CRM e Produtos

Aplicação React/Vite para acompanhar clientes, atendimentos e vendas (CRM) e para o cadastro de produtos. Há dois modos:

- **Local:** sem variáveis de ambiente, usa IndexedDB neste navegador. Serve para desenvolvimento.
- **Compartilhado:** com URL e chave pública do Supabase, exige login, senha e cadastro ativo na equipe antes de abrir o banco comum.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Abra <http://127.0.0.1:5180/>. `npm test`, `npm run test:ui` e `npm run build` fazem as verificações disponíveis. `npm run test:ui` exige Google Chrome instalado e o servidor Vite em execução.

## Configurar o modo compartilhado

1. Use um projeto Supabase exclusivo da Luso. A URL e a chave publishable configuradas neste repositório apontam apenas para esse projeto; não altere a configuração global do Supabase CLI nem os arquivos de outros projetos.
2. Execute [supabase/schema.sql](supabase/schema.sql) no SQL Editor do projeto. O script também substitui a política antiga sem login, caso ela tenha sido aplicada, sem apagar o estado existente. Confira se as tabelas, políticas e a função foram criadas sem erro.
3. No VS Code, abra `.env.local` na pasta da Luso. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados em **Connect** no painel do projeto Supabase. Este arquivo é ignorado pelo Git. Use **somente a chave publishable** no navegador; nunca coloque a chave secret ou service role em variáveis `VITE_`.
4. O sistema entra com **login e senha**, sem e-mail. Como o Supabase Auth só autentica por e-mail, cada login corresponde a um e-mail técnico `login@usuarios.luso.internal`, que não recebe mensagens e não aparece na interface. Logins usam de 3 a 40 caracteres: letras minúsculas sem acento, números, ponto, hífen ou sublinhado.
   - Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. Contas são criadas apenas pela administração.
   - Em **Authentication → Users → Add user → Create new user**, informe o e-mail técnico (ex.: `joao@usuarios.luso.internal` para o login `joao`), a senha e marque **Auto Confirm User**.
   - Depois da primeira conta de administrador, crie as demais pela página **Usuários**. Para a primeira, no SQL Editor, autorize a conta pelo e-mail técnico e marque `is_admin = true`:

   ```sql
   insert into public.luso_members (user_id, display_name, login, is_admin)
   select id, 'Nome exibido', 'joao', true from auth.users
   where email = 'joao@usuarios.luso.internal';
   ```

   - Não há "esqueci a senha", pois o e-mail técnico não recebe mensagens. Para definir uma nova senha, use o SQL Editor:

   ```sql
   update auth.users
   set encrypted_password = extensions.crypt('NOVA-SENHA', extensions.gen_salt('bf'))
   where email = 'joao@usuarios.luso.internal';
   ```

5. Reinicie o Vite. Confirme login, logout, gravação e atualização entre dois navegadores antes de abrir o sistema para a equipe.

Somente contas autenticadas com linha ativa em `luso_members` conseguem ler ou gravar o estado. Todos os membros ativos têm acesso completo nesta versão; o nome da conta aparece na autoria, mas os IDs comerciais internos ainda usam a identidade coletiva `equipe`. Não há cadastro público na interface. Para revogar acesso, defina `active = false` no cadastro do membro e encerre a sessão do usuário em Authentication.

O banco usa uma revisão para impedir que uma gravação sobrescreva outra silenciosamente. Se duas pessoas salvarem ao mesmo tempo, uma delas receberá aviso para atualizar e repetir a ação. As mudanças remotas são transmitidas pela publicação Realtime; confira se ela está ativa no projeto.

## Importar um backup existente

Se você já possui um arquivo de backup JSON da Luso, abra a versão compartilhada, entre com uma conta autorizada e clique em **Importar backup**. A importação só ocorre quando o banco compartilhado ainda está vazio. Depois, confira os totais e o fluxo principal em outro navegador.

A importação não apaga o IndexedDB local. O banco limita o estado JSON a 10 MB. Backups antigos, do tempo em que os cartões eram de obras, são convertidos automaticamente: o nome da obra vira o nome do cliente.

## CRM

Cada cartão do CRM é uma negociação com um **cliente** (nome obrigatório; telefone e e-mail opcionais). O mesmo cliente pode ter mais de um cartão. Em cada cartão a equipe registra **atendimentos** (data, forma de contato, tipo — prospecção, relacionamento ou fechamento —, produtos apresentados, produtos vendidos e anotações); um atendimento de fechamento registra a venda. Próximo passo, venda avulsa, encerramento e reabertura ficam nas ações do cartão. Cada cartão tem um **responsável**: por padrão quem o criou, ou outro usuário escolhido na criação; administradores podem trocar o responsável ao atualizar o cartão. Para excluir um cartão é obrigatório informar o **motivo**; o sistema guarda quem excluiu, quando e por quê, e o cartão aparece na aba **Excluídos** do CRM com o histórico completo (cartões excluídos antes dessa regra aparecem sem motivo). O filtro **Usuário** do CRM mostra só os cartões de uma pessoa (ou os sem responsável, de antes desta regra). A lista de usuários para esse filtro vem da função `luso_team()` do banco, que mostra apenas id e nome dos membros ativos.

## Relatórios

Página só para administradores, entre Produtos e Usuários. Um seletor de período (este mês, mês passado, últimos 90 dias, este ano, todo o período) e um filtro de usuário valem para a página inteira. Mostra total vendido, número de vendas, ticket médio, taxa de conversão (vendas ÷ negociações encerradas) e novas oportunidades, cada um comparado ao período anterior; vendas por produto (quantas vendas incluíram cada produto, já que o valor de uma venda com vários produtos não é dividido); o funil atual por etapa; os motivos de "Sem negócio"; e uma tabela de desempenho por usuário. Cartões excluídos não entram nos números. Os cálculos estão em [src/lib/reports.mjs](src/lib/reports.mjs).

## Usuários

Administradores veem a página **Usuários**, onde criam, editam (nome, login e perfil) e excluem contas. A conta nova recebe uma **senha temporária** (digitada ou gerada na tela) e, no primeiro acesso, a pessoa é obrigada a definir a própria senha antes de usar o sistema. Ao criar, marque **Administrador** se a pessoa também puder gerenciar usuários. Ninguém exclui a própria conta, e o sistema mantém ao menos um administrador. Excluir um usuário remove o login; o histórico registrado por ele continua no CRM.

Criar, editar, excluir e definir a senha do primeiro acesso passam pela Edge Function [`luso-users`](supabase/functions/luso-users/index.ts), que usa a chave service role do próprio Supabase (nunca enviada ao navegador) e confere se quem chama é um membro ativo e administrador. Para publicar uma nova versão da função: `npx supabase functions deploy luso-users --project-ref <ref> --use-api` com `SUPABASE_ACCESS_TOKEN` definido. As colunas `login`, `is_admin` e `must_change_password` de `luso_members` estão em [supabase/schema.sql](supabase/schema.sql).

Para quem esqueceu a senha, edite o usuário e marque **Redefinir senha**: a pessoa recebe uma nova senha temporária e define outra no próximo acesso. Ninguém redefine a própria senha nem remove o próprio perfil de administrador por essa tela.

## Produtos

A página **Produtos** cadastra, edita e exclui os produtos oferecidos aos clientes (nome único, descrição e preço de referência opcionais). Ao criar um cartão no CRM, os produtos cadastrados aparecem para seleção; nomes novos digitados no cartão também entram no cadastro.

As oportunidades guardam o nome do produto. Renomear um produto atualiza os cartões do CRM; vendas, atendimentos e o histórico mantêm o nome da época. Excluir um produto apenas o retira do cadastro e da seleção de novos cartões: os cartões que já o citam continuam com ele. Recadastrar o mesmo nome reativa o produto excluído.

## Publicação na Cloudflare

A Luso é publicada como **Cloudflare Worker com arquivos estáticos**, ligado ao repositório do GitHub: cada push na `main` gera o build e publica. A configuração está em [wrangler.jsonc](wrangler.jsonc) (pasta `dist`) e os cabeçalhos de segurança e cache em [public/_headers](public/_headers).

Primeira publicação, no painel da Cloudflare:

1. **Workers & Pages → Create → Import a repository** e escolha `RAGCode-BR/cidadania-luso` (autorize o app da Cloudflare no GitHub, se pedido).
2. Confira os comandos: **Build command** `npm run build` e **Deploy command** `npx wrangler deploy`. Branch de produção: `main`.
3. Em **Build variables** (ou depois em *Settings → Build → Variables and secrets*), cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os mesmos valores do `.env.local`. Elas entram no JavaScript durante o build; sem elas o site abre no modo local, sem login. Use apenas a chave **publishable**.
4. Clique em **Deploy**. O endereço fica em `https://cidadania-luso.<sua-conta>.workers.dev`; um domínio próprio pode ser ligado em *Settings → Domains & Routes*.
5. No Supabase, em **Authentication → URL Configuration**, troque o **Site URL** pelo endereço publicado.

Para testar localmente exatamente como a Cloudflare serve (com os cabeçalhos de segurança): `npm run preview:cloudflare` e abra <http://127.0.0.1:8788/>. Para publicar a partir desta máquina, sem o GitHub: `npx wrangler login` e depois `npm run deploy`.

A política de segurança (CSP) só permite carregar código do próprio site, a fonte do Google Fonts e conexões com `*.supabase.co`. Se um dia incluir outro serviço externo, acrescente o domínio em `public/_headers`.

O workflow em `.github/workflows/ci.yml` continua rodando testes e build em cada push e pull request. `.env.local`, `node_modules`, `dist`, `.wrangler` e resultados de teste são ignorados pelo Git. A chave publishable fica visível no JavaScript publicado, como previsto: o acesso aos dados depende de login e do cadastro em `luso_members`.

## Limites atuais

O estado compartilhado ainda é um único documento JSON, adequado para uma equipe pequena. Crescimento de dados, permissões diferentes por função, e auditoria forte exigem tabelas por entidade. Nenhuma conta ou credencial de produção é incluída neste repositório.
