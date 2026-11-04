# Luso — CRM e Serviços

Aplicação React/Vite para oportunidades, visitas, vendas e serviços. Há dois modos:

- **Local:** sem variáveis de ambiente, usa IndexedDB neste navegador. Serve para desenvolvimento e para exportar os dados atuais.
- **Compartilhado:** com URL e chave pública do Supabase, exige e-mail, senha e cadastro ativo na equipe antes de abrir o banco comum.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Abra <http://127.0.0.1:5180/>. `npm test`, `npm run test:ui` e `npm run build` fazem as verificações disponíveis. `npm run test:ui` exige Google Chrome instalado e o servidor Vite em execução.

## Configurar o modo compartilhado

1. Crie um projeto Supabase exclusivo da Luso. A conexão deste ambiente ainda precisa ser autenticada; nenhum projeto remoto foi alterado por esta preparação.
2. Execute [supabase/schema.sql](supabase/schema.sql) no SQL Editor do projeto. O script também substitui a política antiga sem login, caso ela tenha sido aplicada, sem apagar o estado existente. Confira se as tabelas, políticas e a função foram criadas sem erro.
3. Copie `.env.example` para `.env.local`. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto. Use **somente a chave publishable** no navegador; nunca coloque a chave secret ou service role em variáveis `VITE_`.
4. Em Authentication, convide ou crie cada usuário com e-mail e senha. Configure a URL do site e os redirecionamentos de convite no projeto. No SQL Editor, autorize cada conta pelo UUID exibido em Authentication:

   ```sql
   insert into public.luso_members (user_id, display_name)
   values ('UUID-DO-USUARIO', 'Nome exibido');
   ```

5. Reinicie o Vite. Confirme login, logout, gravação e atualização entre dois navegadores antes de abrir o sistema para a equipe.

Somente contas autenticadas com linha ativa em `luso_members` conseguem ler ou gravar o estado. Todos os membros ativos têm acesso completo nesta versão; o nome da conta aparece na autoria, mas os IDs comerciais internos ainda usam a identidade coletiva `equipe`. Não há cadastro público na interface. Para revogar acesso, defina `active = false` no cadastro do membro e encerre a sessão do usuário em Authentication.

O banco usa uma revisão para impedir que uma gravação sobrescreva outra silenciosamente. Se duas pessoas salvarem ao mesmo tempo, uma delas receberá aviso para atualizar e repetir a ação. As mudanças remotas são transmitidas pela publicação Realtime; confira se ela está ativa no projeto.

## Migrar dados locais

1. No navegador que contém os dados locais, abra a versão local e clique em **Baixar backup**. Guarde o JSON em local privado; ele pode conter contatos e fotos.
2. Abra a versão compartilhada, entre com uma conta autorizada e clique em **Importar backup**. Selecione o JSON baixado. A importação só ocorre quando o banco compartilhado ainda está vazio.
3. Confira os totais e o fluxo principal em outro navegador. Faça um novo backup pelo modo compartilhado.

A importação não apaga o IndexedDB local. Fotos continuam embutidas no estado JSON; o banco limita esse estado a 10 MB. Antes de usar muitas fotos em produção, migre os arquivos para armazenamento de objetos e mantenha apenas referências no banco.

## GitHub e publicação

`.env.local`, `node_modules`, `dist` e resultados de teste são ignorados pelo Git. O workflow em `.github/workflows/ci.yml` executa testes e build em cada push e pull request. Configure as variáveis `VITE_` no serviço de hospedagem. Se usar GitHub Pages em um repositório de projeto, defina `VITE_BASE_PATH=/<nome-do-repositorio>/` no build. O GitHub hospeda o frontend; banco e autenticação ficam no Supabase. A chave publishable estará visível no JavaScript, como previsto; as políticas do banco e a função de gravação exigem membro autenticado.

## Limites atuais

O estado compartilhado ainda é um único documento JSON, adequado para uma equipe pequena. Crescimento de dados, permissões diferentes por função, auditoria forte e fotos em volume exigem tabelas por entidade e Storage. O histórico importado começa vazio. Nenhuma conta, credencial, foto ou dado de produção da FAMAC é incluído neste repositório.
