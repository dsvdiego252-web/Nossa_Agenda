# Verificação local

- Build de produção: concluído, com manifesto, ícones e service worker versionado.
- Testes automatizados: 12 aprovados (datas, validação, SQL/RLS, fila offline e Web Push).
- PostgreSQL de teste: PGlite, com papéis anon/authenticated e auth.uid simulados; schema executado integralmente.
- Navegador: Chrome, contextos isolados, desktop 1440px e celular 390px.
- Fluxos aprovados: criar, editar offline, duplicar, excluir série, filtrar, navegar por mês/semana/dia, repetição semanal e validação de horários.
- PWA: service worker ativo, reabertura offline e persistência IndexedDB verificadas.
- Interface: sem rolagem horizontal em 390px e sem erros de JavaScript nos fluxos testados.
- Capturas disponíveis em test-results/ (arquivos locais ignorados pelo Git).

## Dependências externas não testadas neste ambiente

Em 22/09/2026, a estrutura exclusiva da agenda foi instalada no projeto Supabase compartilhado. Confirmados: dois membros, zero compromissos, RLS nas duas tabelas e inclusão na publicação Realtime. Os 10 testes locais passaram novamente, incluindo preservação de tabelas preexistentes. Login com as senhas reais, WebSockets entre celulares e instalação em aparelhos físicos ainda exigem validação pelos usuários.

Web Push foi implementado em 29/09/2026. Testes locais cobrem autenticação do dispatcher, rejeição de endpoints privados, inscrição restrita aos membros, recorrência diária, reserva de entregas, deduplicação, nova tentativa após falha, limitação de testes e remoção de inscrições expiradas. Build aprovado. A entrega em aparelhos físicos ainda depende de ativação e teste pelos usuários.

Nenhum evento real foi adicionado. Produção atualizada em https://nossa-agenda-one.vercel.app (Vercel: Ready; commit 8e032e0). Tela de login habilitada conferida após atualização do service worker. URL e chave publicável configuradas em variáveis VITE_AGENDA_* de produção; nenhuma senha administrativa foi usada no frontend.

## Convite de instalação — 23/09/2026

Build aprovado. Verificado no navegador em 390 × 844: convite antes do login, abertura das instruções, campos de login disponíveis e fechamento persistente durante a sessão. Fluxo de Preferências usa a mesma ação de instalação. A confirmação nativa depende do navegador e não foi validada em um celular físico; instruções específicas para iPhone incluídas.
