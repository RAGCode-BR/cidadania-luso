# Luso — CRM e Serviços

Aplicação React/Vite para oportunidades, visitas, vendas e serviços. Há dois modos:

- **Local:** sem variáveis de ambiente, usa IndexedDB neste navegador. Serve para desenvolvimento e para exportar os dados atuais.
- **Compartilhado:** com URL e chave pública do Supabase, abre diretamente o mesmo banco em todos os navegadores, sem login.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Abra <http://127.0.0.1:5180/>. `npm test`, `npm run test:ui` e `npm run build` fazem as verificações disponíveis. `npm run test:ui` exige Google Chrome instalado e o servidor Vite em execução.

## Configurar o modo compartilhado

1. Crie um projeto Supabase exclusivo da Luso. A conexão deste ambiente ainda precisa ser autenticada; nenhum projeto remoto foi alterado por esta preparação.
2. Execute [supabase/schema.sql](supabase/schema.sql) **uma vez** no SQL Editor do projeto. Confira se as tabelas, políticas e a função foram criadas sem erro.
3. Copie `.env.example` para `.env.local`. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto. Use **somente a chave publishable** no navegador; nunca coloque a chave secret ou service role em variáveis `VITE_`.
4. Reinicie o Vite. Confirme a gravação e a atualização entre dois navegadores antes de abrir o sistema para a equipe.

**Acesso sem login:** a chave pública fica no frontend. Qualquer pessoa que obtenha o endereço do projeto e essa chave poderá ler, alterar ou baixar todos os registros, inclusive contatos e fotos. Restringir o acesso ao site não protege a API do banco. Não publique dados reais de clientes nessa configuração; para uso real, será preciso autenticação ou uma camada de servidor que controle acesso. A autoria aparece como `Equipe Luso` para todas as ações.

O banco usa uma revisão para impedir que uma gravação sobrescreva outra silenciosamente. Se duas pessoas salvarem ao mesmo tempo, uma delas receberá aviso para atualizar e repetir a ação. As mudanças remotas são transmitidas pela publicação Realtime; confira se ela está ativa no projeto.

## Migrar dados locais

1. No navegador que contém os dados locais, abra a versão local e clique em **Baixar backup**. Guarde o JSON em local privado; ele pode conter contatos e fotos.
2. Abra a versão compartilhada e clique em **Importar backup**. Selecione o JSON baixado. A importação só ocorre quando o banco compartilhado ainda está vazio. Como o banco está aberto sem login, importe apenas dados de avaliação.
3. Confira os totais e o fluxo principal em outro navegador. Faça um novo backup pelo modo compartilhado.

A importação não apaga o IndexedDB local. Fotos continuam embutidas no estado JSON; o banco limita esse estado a 10 MB. Antes de usar muitas fotos em produção, migre os arquivos para armazenamento de objetos e mantenha apenas referências no banco.

## GitHub e publicação

`.env.local`, `node_modules`, `dist` e resultados de teste são ignorados pelo Git. O workflow em `.github/workflows/ci.yml` executa testes e build em cada push e pull request. Configure as variáveis `VITE_` no serviço de hospedagem. Se usar GitHub Pages em um repositório de projeto, defina `VITE_BASE_PATH=/<nome-do-repositorio>/` no build. O GitHub hospeda o frontend; o banco permanece no Supabase. Mesmo que a chave pública não seja enviada ao Git, ela estará visível no JavaScript do site publicado.

## Limites atuais

O estado compartilhado ainda é um único documento JSON, adequado para avaliação por uma equipe pequena. Crescimento de dados, permissões diferentes por função, auditoria forte e fotos em volume exigem tabelas por entidade e Storage. O histórico importado começa vazio. Nenhuma conta, credencial, foto ou dado de produção da FAMAC é incluído neste repositório.
