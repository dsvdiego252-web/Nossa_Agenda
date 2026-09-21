# Agenda Familiar — Diego & Daiane

Uma agenda privada para duas pessoas, feita com **HTML, CSS e JavaScript**, com Supabase Auth, PostgreSQL e Realtime. Interface responsiva, PWA instalável e calendário inicialmente vazio.

## O que está pronto

- Login individual por e-mail e senha. Não existe cadastro público nem criação de famílias.
- Calendário mensal, semanal e diário, destaque de hoje, indicadores, lista do dia selecionado e próximos 60 dias.
- Criar, editar, duplicar e excluir compromissos.
- Responsáveis Diego, Daiane, Ambos e Família, cores padrão, cor personalizada e legenda.
- Categorias livres: escreva uma nova no formulário; ela passa a aparecer nos filtros enquanto houver um compromisso usando-a.
- Repetições diária, semanal, mensal e em dias da semana, com término opcional.
- Observações e lembretes: na hora, 10 ou 30 minutos, 1 hora ou 1 dia antes.
- IndexedDB com fila offline por usuário; sincronização no retorno da conexão, ao voltar ao app e a cada 30 segundos como recuperação.
- Supabase Realtime atualiza a agenda quando o outro aparelho altera um compromisso.
- Controle de versão para conflitos e identificador de operação para tentativas repetidas.
- Exportação JSON em Preferências para guardar uma cópia. Importação não está implementada.
- Manifesto, ícones PNG e service worker que armazena apenas os arquivos públicos do app.
- Testes automatizados de datas, fila offline, SQL/RLS e navegador.

**Ainda depende de configuração externa:** criar um projeto Supabase, executar o SQL, criar as duas contas e preencher as variáveis. GitHub e Vercel não foram criados nem publicados automaticamente. A entrega de notificações com o app fechado **não está implementada**; veja a seção específica abaixo.

## 1. Preparar o computador

1. Instale o **Node.js 24 LTS** pelo [site oficial](https://nodejs.org/).
2. Abra um terminal na pasta do projeto. No Windows, clique na barra de endereço do Explorador, digite `powershell` e pressione Enter.
3. Instale o gerenciador de pacotes:

```powershell
npm install --global pnpm@11.25.0
```

4. Instale as dependências do projeto:

```powershell
pnpm install --frozen-lockfile
```

Se o PowerShell bloquear scripts, use `npm.cmd` e `pnpm.cmd` no lugar de `npm` e `pnpm`. Não é necessário desabilitar a segurança do Windows.

## 2. Ver a interface localmente, antes de configurar o banco

```powershell
pnpm dev
```

Abra o endereço mostrado no terminal, normalmente [http://127.0.0.1:5173](http://127.0.0.1:5173).

Sem variáveis válidas, aparece a opção **Explorar prévia local**. Ela começa vazia, guarda dados só no navegador e não acessa o Supabase. Os compromissos criados nela não serão migrados para as contas reais. Sair da prévia remove esses dados.

A prévia serve para testar a interface; **não é um mecanismo de login ou uma conta real**. Com o Supabase configurado, o botão de prévia não aparece.

Para parar o servidor, pressione **Ctrl+C** no terminal.

## 3. Criar e configurar o Supabase

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e entre na sua conta.
2. Crie um **projeto novo e dedicado** a esta agenda. Escolha organização, região e plano conforme sua preferência. Guarde a senha do banco em um gerenciador de senhas.
3. Em **Authentication → configuração de Sign In / Providers**, mantenha apenas e-mail e senha e **desative a opção que permite novos cadastros / Allow new users to sign up**. Desative também login anônimo e provedores sociais.
4. Abra o **SQL Editor**.
5. Copie **todo** o conteúdo de [supabase/schema.sql](supabase/schema.sql), cole e execute.
6. Execute esse arquivo **uma única vez em um projeto vazio**. Ele cria tabelas, restrições, RLS, funções, trigger e publicação Realtime. Não apaga tabelas existentes; uma segunda execução encontrará objetos já criados e será revertida pela transação.
7. Em **Database → Publications**, confira que `public.events` está incluída em `supabase_realtime`. O SQL faz isso automaticamente quando a publicação existe. Em uma instalação sem essa publicação, configure-a antes de testar Realtime.

O script **não cria usuários, senhas, famílias nem eventos de exemplo**.

### Por que uma terceira pessoa não consegue entrar na agenda?

A tabela `members` aceita somente os nomes Diego e Daiane, cada um uma única vez. O ID é o UUID do Supabase Auth. Somente o administrador do projeto consegue escrever nessa tabela.

As políticas RLS verificam a existência do UUID autenticado nessa lista antes de ler ou alterar compromissos. Um terceiro usuário criado acidentalmente no Auth não ganha acesso. As permissões não dependem de `user_metadata`, e-mails escritos no frontend ou de esconder botões.

A página de login e os arquivos estáticos podem ser públicos; **os compromissos no banco são privados**. Um repositório privado também é recomendado.

## 4. Criar manualmente as contas do Diego e da Daiane

1. No painel, abra **Authentication → Users → Add user → Create new user**.
2. Crie o usuário do Diego usando o e-mail real dele e uma senha forte, exclusiva.
3. Confirme o e-mail manualmente na criação, se o painel oferecer **Auto confirm user**. O cadastro público deve continuar desativado.
4. Faça o mesmo para Daiane, com outro e-mail e outra senha.
5. Copie o **User UID / UUID** de cada conta. Não use o e-mail no campo UUID.
6. Volte ao SQL Editor e execute este comando, substituindo os dois valores:

```sql
insert into public.members (id, name) values
  ('UUID-REAL-DO-DIEGO', 'Diego'),
  ('UUID-REAL-DA-DAIANE', 'Daiane');
```

7. Verifique:

```sql
select id, name from public.members;
```

Devem aparecer **exatamente duas linhas**. Não inclua senhas nesse SQL, nos arquivos ou no GitHub.

**Redefinir senha:** use as opções administrativas de recuperação no painel Authentication. O app não contém um formulário próprio de recuperação. Para envio confiável de e-mails de recuperação pelo Supabase, configure SMTP e os URLs de redirecionamento apropriados. Não compartilhe as credenciais de administração com o app.

**Revogar acesso:** remova o UUID da tabela `members` pelo painel e revogue as sessões no Auth. A próxima leitura/escrita online será negada. Um aparelho offline pode continuar exibindo a cópia que já baixou; nenhum sistema offline consegue apagar remotamente dados de um aparelho desconectado.

## 5. Conectar o projeto ao Supabase

1. No painel do Supabase, localize o **Project URL** e a **publishable key** em Connect / API Keys.
2. Na raiz do projeto, copie `.env.example` para `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

Em macOS/Linux: `cp .env.example .env.local`.

3. Edite `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://SEU-ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

4. Use exclusivamente a **publishable key** (ou a chave legada `anon`, se necessário). **Nunca use `service_role`, `sb_secret_...` ou a senha do banco**. Variáveis com prefixo `VITE_` ficam embutidas no JavaScript público. A proteção dos dados vem do Auth e das políticas RLS.
5. Reinicie `pnpm dev` após alterar as variáveis.
6. Entre com o e-mail e senha de uma das duas contas.

Em Authentication → URL Configuration, configure o Site URL para o endereço local durante desenvolvimento e para o endereço HTTPS final após publicar. Não habilite cadastros para corrigir erros de login.

A política CSP de `vercel.json` permite os domínios padrão `*.supabase.co`. Se usar domínio customizado ou Supabase auto-hospedado, adapte o `connect-src` para o seu endpoint HTTPS/WSS.

## 6. Como usar

- **Novo compromisso:** informe título, responsável, data, início/fim e categoria.
- **Categoria personalizada:** escreva qualquer nome de até 40 caracteres no campo Categoria.
- **Cor:** começa na cor padrão do responsável. Você pode alterar a cor individual.
- **Editar:** toque no compromisso na lista do dia ou em “Vem por aí”.
- **Duplicar:** abra o compromisso e toque em Duplicar. Revise os campos e salve. A cópia usa a data atualmente selecionada no calendário.
- **Excluir:** abra o compromisso e confirme a exclusão da série.
- **Filtros:** responsável e categoria são combinados; “Limpar” restaura todos.
- **Repetição semanal:** mantém o dia da semana da data inicial.
- **Personalizada:** selecione os dias da semana; nenhuma ocorrência é exibida antes da data inicial.
- **Mensal no dia 29/30/31:** pula os meses em que aquele dia não existe. Não muda automaticamente para o último dia do mês.
- **Limite da repetição:** inclui a data final. Vazio significa continuar indefinidamente.
- **Editar/excluir uma repetição altera a série inteira**, inclusive ocorrências passadas. Exceções individuais e “somente esta ocorrência” não são implementadas.
- **Horários:** mesma data, fim maior que início; compromissos atravessando a meia-noite precisam ser divididos. A agenda usa o horário de Brasília.
- **Hoje:** volta à data atual. Mês/Semana/Dia mudam o intervalo mostrado.

## 7. Testar a sincronização real

Faça esta etapa **depois de configurar o Supabase**. Os testes locais não substituem esta validação dos serviços hospedados.

1. Abra uma janela normal e outra anônima, ou dois navegadores.
2. Entre como Diego em uma e Daiane na outra.
3. Crie um compromisso temporário, por exemplo “Teste de sincronização”.
4. Confira se aparece na outra janela sem recarregar.
5. Edite na segunda janela e observe a primeira.
6. Exclua e verifique o desaparecimento nas duas.
7. Se não atualizar imediatamente, confira a publicação Realtime. O app também consulta novamente a cada 30 segundos, ao focar e ao reconectar.
8. Para testar RLS, crie opcionalmente uma terceira conta temporária no Auth, **sem inseri-la em members**. Ela não deve conseguir entrar na agenda. Remova-a depois. Não é necessário nem possível adicionar uma terceira linha válida em members.

### Testar offline de verdade

O service worker só é gerado na compilação de produção:

```powershell
pnpm build
pnpm preview
```

1. Abra [http://127.0.0.1:4173](http://127.0.0.1:4173), entre e espere “Sincronizado”.
2. Recarregue uma vez conectado para garantir que o service worker controla a página.
3. Desligue a conexão ou use DevTools → Network → Offline.
4. Crie ou edite um compromisso. Ele fica no IndexedDB com uma operação pendente.
5. Recarregue o app offline: a sessão anterior e os dados armazenados permitem continuar nesse aparelho.
6. Reconecte, mantenha o app aberto e aguarde “Sincronizado”.
7. Confira o outro navegador.
8. Uma sessão expirada pode exigir novo login antes de enviar a fila. O primeiro login sempre exige internet.

### Testar conflito

1. Com as duas janelas sincronizadas, deixe Diego offline.
2. Edite um compromisso no aparelho do Diego.
3. No aparelho online da Daiane, edite **o mesmo compromisso** e espere sincronizar.
4. Reconecte Diego.
5. O app mostrará o conflito. Escolha:
   - **Usar versão compartilhada:** descarta as operações locais pendentes daquele compromisso.
   - **Manter edição como cópia:** preserva o compromisso compartilhado e cria outro com a última versão local.
6. Para uma exclusão local em conflito, a opção de cópia mantém a versão compartilhada, pois não há um evento local ativo a copiar.

Nenhuma versão remota é sobrescrita silenciosamente. A fila aguarda a resolução do conflito antes de continuar.

### Limites e privacidade offline

- A sincronização acontece com o app aberto; não depende de Background Sync.
- IndexedDB contém compromissos e a fila, separados por UUID. O SDK do Supabase persiste a sessão no navegador.
- O service worker **não** armazena respostas do Supabase, tokens ou dados privados.
- Os dados locais não possuem criptografia adicional no app. Use bloqueio de tela e não faça login em aparelhos compartilhados.
- Sair remove os dados locais da conta. Se houver operações pendentes, uma confirmação informa que serão perdidas. É possível exportar uma cópia JSON antes.
- Limpar dados do navegador, remover o app ou falta de espaço pode apagar alterações ainda não sincronizadas. A exportação ajuda, mas não substitui backups do banco.
- Eventos excluídos permanecem como registros marcados `deleted` no banco para propagar exclusões a aparelhos offline.
- Exclusões antigas não são removidas automaticamente. Não apague esses registros sem planejar a invalidação das cópias offline.
- Atualizações do app aguardam fechar todas as abas/janelas da versão anterior. Reabra conectado para carregar a nova versão.

## 8. Notificações: o que funciona e o que precisa ser feito

### Implementado

Em **Preferências → Ativar lembretes**, conceda permissão em cada aparelho. Cada compromisso tem uma antecedência compartilhada; a opção de ativar notificações é individual por dispositivo/usuário.

O app verifica lembretes a cada 30 segundos enquanto está executando e tenta exibir a notificação no minuto de vencimento. Há deduplicação local. Lembretes vencidos há mais de um minuto não são reenviados ao abrir o app mais tarde.

**Não há garantia de alerta pontual se o navegador suspender a aba, o sistema economizar bateria, o app fechar ou a tela estiver bloqueada.** Isso é uma limitação da implementação local, não algo que se resolve apenas permitindo notificações.

### Para notificações com o app fechado

É necessário implementar e configurar um serviço real de **Web Push**, incluindo:

1. Gerar chaves VAPID e guardar a chave privada somente no servidor.
2. Solicitar permissão e registrar `PushSubscription` em cada aparelho.
3. Criar tabela de subscriptions com RLS por usuário.
4. Implementar um agendador seguro (por exemplo, Supabase Cron + Edge Function) que expanda as recorrências, calcule os horários em Brasília e dispare os lembretes.
5. Adicionar registro de entregas/idempotência, novas tentativas, limpeza de subscriptions expiradas e checagem de acesso.
6. Implementar o evento `push` no service worker.
7. Testar entrega com app fechado em Android e iPhone.

**Esses componentes não fazem parte desta versão e não há uma variável secreta que simplesmente os ative.** O app já guarda a antecedência no banco e trata clique em notificação, mas o servidor de push e o agendamento precisam ser desenvolvidos. No iPhone, notificações web dependem de versão compatível do iOS e app instalado na tela inicial. Consulte a [documentação WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) para requisitos.

## 9. Testes locais

```powershell
pnpm test
pnpm build
pnpm preview
```

Em outro terminal, com Google Chrome instalado e **uma compilação sem variáveis Supabase** para usar a prévia:

```powershell
pnpm test:browser
```

- Testes unitários: recorrências, datas, validação, persistência/fila, conflitos, resposta perdida e isolamento.
- Banco: executa o schema em PostgreSQL local via PGlite, simulando `auth.uid()` e os papéis do Supabase; verifica restrições, RLS, versões e acesso negado.
- Navegador: usa uma sessão isolada do Chrome e dados temporários para testar criação, edição, duplicação, exclusão, filtros, navegação, modo offline e telas móveis. Salva capturas em `test-results/` (ignorada no Git).
- Os testes não criam projetos remotos nem exercitam o serviço hospedado de Auth ou os WebSockets reais. O roteiro da seção 7 valida essa integração.
- Para regenerar os ícones após modificar o SVG: `node scripts/icons.mjs`.

## 10. Publicar no GitHub — quando você decidir

1. Instale o Git, se ainda não estiver instalado.
2. Crie no GitHub um repositório **privado**, vazio, sem README inicial.
3. Confira que `.env.local` está ignorado. Nunca adicione chaves secretas, senhas ou exportações dos compromissos.
4. Na pasta:

```powershell
git status
git add .
git commit -m "Implementa Agenda Familiar"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

A pasta entregue já é um repositório Git. Se você copiar os arquivos para outra pasta sem Git, execute `git init` antes. Se `origin` já existir, confira `git remote -v` em vez de adicioná-lo novamente.

O comando `git add .` respeita `.gitignore`, mas sempre revise `git status` antes de fazer commit.

## 11. Publicar na Vercel — depois dos testes

1. Entre em [vercel.com](https://vercel.com/).
2. Escolha **Add New → Project**, conecte GitHub e importe o repositório.
3. Confirme framework **Vite**, build `pnpm build` e pasta de saída `dist`.
4. Adicione as mesmas duas variáveis de `.env.local` em **Environment Variables**. Use a publishable key, nunca chaves administrativas.
5. Escolha Node.js 24, se disponível; o projeto exige Node 22.12 ou superior.
6. Publique.
7. Anote o endereço HTTPS final.
8. No Supabase → Authentication → URL Configuration, ajuste Site URL para esse endereço.
9. Teste os dois logins e a sincronização novamente.
10. Mudanças nas variáveis exigem uma nova compilação/deploy.

O arquivo `vercel.json` já inclui headers de segurança e impede cache prolongado do service worker. Não são necessários servidor Node em produção, Next.js ou rotas de API na Vercel.

## 12. Instalar nos celulares

Use o endereço **HTTPS** publicado. Um endereço HTTP com o IP da rede local não oferece o mesmo suporte de PWA de `localhost`.

**Android / Chrome**
1. Abra o link.
2. Entre com sua conta.
3. Use Preferências → Instalar aplicativo ou menu do Chrome → Instalar aplicativo / Adicionar à tela inicial.
4. Abra pelo ícone e permita lembretes, se quiser.

**iPhone / Safari**
1. Abra o link no Safari.
2. Toque em Compartilhar → Adicionar à Tela de Início.
3. Confirme o nome e adicione.
4. Abra pelo ícone e entre na sua conta. A sessão da PWA pode ser separada da sessão da aba do Safari.
5. Ative lembretes em Preferências, caso a versão do sistema ofereça suporte.

Cada pessoa usa a própria conta no próprio aparelho. A primeira abertura deve ocorrer online para baixar os arquivos e sincronizar.

## Organização

```text
index.html                 Entrada HTML
src/
  app.js                   Interface, formulários e autenticação
  styles.css               Layout responsivo
  dates.js                 Datas, recorrência e validação
  backend.js               Cliente Supabase e chamadas ao banco
  storage.js               IndexedDB
  sync.js                  Fila, controle de versão e conflitos
  notifications.js         Lembretes locais
  sw-template.js           Modelo do service worker
public/
  manifest.webmanifest     Instalação PWA
  icons/                   Ícones SVG e PNG
supabase/schema.sql        Banco, políticas RLS e funções
scripts/
  build-sw.mjs             Cache versionado da compilação
  icons.mjs                Geração dos PNGs
tests/                     Testes locais
.env.example               Modelo das variáveis públicas
vercel.json                Build e headers de publicação
pnpm-lock.yaml             Versões exatas das dependências
```

## Se algo não funcionar

| Sintoma | O que conferir |
| --- | --- |
| Aparece “Explorar prévia local” | Variáveis não preenchidas; reinicie o servidor ou faça novo deploy. |
| Login recusado | E-mail, senha, usuário confirmado no Auth e conexão. |
| Conta não autorizada | UUID correto na tabela members; o nome sozinho não basta. |
| Não sincroniza | SQL executado, RLS, Project URL, publishable key e conexão. |
| Realtime não atualiza | Tabela events na publicação supabase_realtime; teste após 30 segundos. |
| Erro de conflito | Resolva o aviso no app; não altere version manualmente. |
| Não abre offline | Use build + preview/HTTPS, abra conectado e recarregue antes de desconectar. |
| Não instala | HTTPS, navegador compatível, manifesto/ícones acessíveis e app não instalado anteriormente. |
| Sem alerta com tela bloqueada | Esta versão não inclui serviço Web Push. Consulte a seção 8. |
| Alteração não aparece na versão publicada | Faça build/deploy e feche todas as abas antigas para ativar o novo service worker. |

## Referências oficiais

- [Autenticação por senha](https://supabase.com/docs/guides/auth/passwords)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Realtime: Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Vite](https://vite.dev/guide/)

