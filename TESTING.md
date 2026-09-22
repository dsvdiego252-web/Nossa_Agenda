# Verificação local

- Build de produção: concluído, com manifesto, ícones e service worker versionado.
- Testes automatizados: 10 aprovados (datas, validação, SQL/RLS e fila offline).
- PostgreSQL de teste: PGlite, com papéis anon/authenticated e auth.uid simulados; schema executado integralmente.
- Navegador: Chrome, contextos isolados, desktop 1440px e celular 390px.
- Fluxos aprovados: criar, editar offline, duplicar, excluir série, filtrar, navegar por mês/semana/dia, repetição semanal e validação de horários.
- PWA: service worker ativo, reabertura offline e persistência IndexedDB verificadas.
- Interface: sem rolagem horizontal em 390px e sem erros de JavaScript nos fluxos testados.
- Capturas disponíveis em test-results/ (arquivos locais ignorados pelo Git).

## Dependências externas não testadas neste ambiente

Em 22/09/2026, a estrutura exclusiva da agenda foi instalada no projeto Supabase compartilhado. Confirmados: dois membros, zero compromissos, RLS nas duas tabelas e inclusão na publicação Realtime. Os 10 testes locais passaram novamente, incluindo preservação de tabelas preexistentes. Login com as senhas reais, WebSockets entre celulares e instalação em aparelhos físicos ainda exigem validação pelos usuários.

Notificações locais foram implementadas com permissão por aparelho. A entrega em aparelhos físicos não foi validada; notificações com o app fechado exigem uma implementação adicional de Web Push e agendamento no servidor.

Nenhum evento real foi adicionado. A publicação existente na Vercel foi identificada; a atualização de conexão está em andamento.
