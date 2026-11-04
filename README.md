# Luso — CRM e Serviços

Aplicação React/Vite para oportunidades, visitas, vendas e serviços. Há dois modos:

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
   - No SQL Editor, autorize cada conta pelo e-mail técnico:

   ```sql
   insert into public.luso_members (user_id, display_name)
   select id, 'Nome exibido' from auth.users
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

A importação não apaga o IndexedDB local. Fotos continuam embutidas no estado JSON; o banco limita esse estado a 10 MB. Antes de usar muitas fotos em produção, migre os arquivos para armazenamento de objetos e mantenha apenas referências no banco.

## GitHub e publicação

`.env.local`, `node_modules`, `dist` e resultados de teste são ignorados pelo Git. O workflow em `.github/workflows/ci.yml` executa testes e build em cada push e pull request. Configure as variáveis `VITE_` no serviço de hospedagem. Se usar GitHub Pages em um repositório de projeto, defina `VITE_BASE_PATH=/<nome-do-repositorio>/` no build. O GitHub hospeda o frontend; banco e autenticação ficam no Supabase. A chave publishable estará visível no JavaScript, como previsto; as políticas do banco e a função de gravação exigem membro autenticado.

## Limites atuais

O estado compartilhado ainda é um único documento JSON, adequado para uma equipe pequena. Crescimento de dados, permissões diferentes por função, auditoria forte e fotos em volume exigem tabelas por entidade e Storage. Nenhuma conta, credencial ou foto de produção é incluída neste repositório.
