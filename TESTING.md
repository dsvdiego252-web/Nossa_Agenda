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

Não foi criado ou configurado um projeto Supabase real. Login hospedado, WebSockets Realtime entre celulares, instalação em aparelhos físicos e publicação na Vercel precisam do roteiro do README após a configuração das contas.

Notificações locais foram implementadas com permissão por aparelho. A entrega em aparelhos físicos não foi validada; notificações com o app fechado exigem uma implementação adicional de Web Push e agendamento no servidor.

Nenhum evento real foi adicionado e nenhum projeto remoto foi publicado.
