let pendingPrompt;
let busy = false;
let installed = false;
let dismissed = false;
const standalone = window.matchMedia('(display-mode: standalone)');
const mobile = window.matchMedia('(max-width: 768px)');
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
try { dismissed = sessionStorage.getItem('agenda-install-dismissed') === '1'; } catch {}
const panel = document.createElement('aside');
panel.className = 'install-banner';
panel.setAttribute('aria-label', 'Instalar Agenda Familiar');
panel.hidden = true;
panel.innerHTML = `<div class="install-banner-main"><img src="/icons/icon-192.png" width="44" height="44" alt=""><div><strong>Sua agenda na Tela de Início</strong><p>Instale para abrir como um aplicativo.</p></div><button type="button" class="primary" id="install-now">Instalar</button><button type="button" class="icon-button" id="install-dismiss" aria-label="Agora não">×</button></div><p id="install-help" hidden></p>`;
document.body.prepend(panel);
const button = panel.querySelector('#install-now');
const help = panel.querySelector('#install-help');
function isInstalled() { return installed || standalone.matches || navigator.standalone === true; }
function render() {
  panel.hidden = isInstalled() || dismissed || (!mobile.matches && !ios && !pendingPrompt);
  button.disabled = busy;
  button.textContent = busy ? 'Aguarde…' : pendingPrompt ? 'Instalar' : 'Como instalar';
}
function instructions() {
  help.textContent = ios
    ? 'No Safari, toque em Compartilhar → Adicionar à Tela de Início → Adicionar. Se houver a opção “Abrir como App”, deixe-a ativada. Se abriu o link dentro de outro aplicativo, abra-o primeiro no Safari.'
    : 'No Chrome, abra o menu ⋮ → Adicionar à tela inicial ou Instalar aplicativo. Se abriu este link dentro do WhatsApp ou de outro aplicativo, escolha abrir no navegador primeiro.';
  help.hidden = false;
}
export async function requestInstall() {
  if (isInstalled()) return;
  dismissed = false;
  render();
  panel.hidden = false;
  if (!pendingPrompt) { instructions(); panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
  if (busy) return;
  const prompt = pendingPrompt;
  pendingPrompt = null;
  busy = true;
  render();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') { dismissed = true; }
    else instructions();
  } catch { instructions(); }
  finally { busy = false; render(); }
}
button.addEventListener('click', requestInstall);
panel.querySelector('#install-dismiss').addEventListener('click', () => {
  dismissed = true;
  try { sessionStorage.setItem('agenda-install-dismissed', '1'); } catch {}
  render();
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingPrompt = event;
  render();
});
window.addEventListener('appinstalled', () => { installed = true; pendingPrompt = null; render(); });
standalone.addEventListener('change', render);
mobile.addEventListener('change', render);
render();
