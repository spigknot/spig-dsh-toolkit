import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalWeb } from './local-web-proxy.mjs';

// O supervisor inicia este script como SYSTEM (sessao 0). Nessa sessao o
// seletor nativo do Windows cria uma janela invisivel e o fluxo de "Add
// workspace" fica travado. Um overlay --patch fixa o seletor interno (browse),
// que abre a selecao de diretorio dentro do proprio app.
const pickerPatch = fileURLToPath(new URL('./dsh-picker-browse.patch.yml', import.meta.url));

const userProfile = process.env.DSH_USER_PROFILE || process.env.USERPROFILE;
const localAppData = process.env.DSH_LOCALAPPDATA || process.env.LOCALAPPDATA ||
  (userProfile ? join(userProfile, 'AppData', 'Local') : '');
if (!localAppData) throw new Error('Perfil do usuário DSH não configurado.');
const install = process.env.DSH_INSTALL_DIR || join(localAppData, 'Programs', 'DeepSeek Harness');
const cli = join(install, 'resources', 'app.asar', 'dsh', 'node_modules',
  '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
const address = 'http://127.0.0.1:3080/';
const response = await fetch(address, { signal: AbortSignal.timeout(1000) }).catch(() => null);
if (response?.ok && response.headers.get('x-dsh-local') === '1') {
  if (!process.argv.includes('--no-open')) openBrowser();
  process.exit(0);
}

const computerName = String(process.env.COMPUTERNAME || '').trim().toLowerCase();
const localHostNames = ['127.0.0.1', 'localhost', ...(computerName ? [computerName, `${computerName}.local`] : [])];
const proxy = new LocalWeb('0.0.0.0', localHostNames);
let tailnetTimer;
const child = spawn(join(install, 'DeepSeek Harness.exe'), [
  '--expose-internals', cli, 'web', '--patch', pickerPatch,
  '--host', '127.0.0.1', '--port', '0', '--no-open',
], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true });
const startup = setTimeout(() => fail('O DSH não informou o endereço inicial.'), 60000);
let starting = true;
let buffer = '';

for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    if (!starting) return;
    buffer = (buffer + chunk).slice(-8192);
    const match = buffer.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/[^\s]+)\s/);
    if (!match) return;
    starting = false;
    proxy.open(match[1]).then(result => {
      if (!result.address) return fail('Não foi possível liberar a porta local 3080.');
      clearTimeout(startup);
      async function refreshTailnet() {
        let self;
        try {
          self = JSON.parse(execFileSync(process.env.DSH_TAILSCALE_PATH || 'tailscale', ['status', '--json'], {
            encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
          }));
        } catch {}
        if (!self) return;
        const running = self.BackendState === 'Running';
        const selfIps = running ? (self.Self?.TailscaleIPs || []) : [];
        const peers = running ? Object.values(self.Peer || self.Peers || {}).flatMap(peer => peer.TailscaleIPs || []) : [];
        const dns = running ? self.Self?.DNSName?.replace(/\.$/, '') : '';
        proxy.setTailnetPeers([...selfIps, ...peers]);
        proxy.setHostNames([...localHostNames, ...selfIps, ...(dns ? [dns, dns.split('.')[0]] : [])]);
      }
      void refreshTailnet();
      tailnetTimer = setInterval(refreshTailnet, 15000);
      if (!process.argv.includes('--no-open')) openBrowser();
    }).catch(() => fail('O servidor local não pôde ser iniciado.'));
  });
}
child.on('error', error => fail(`O executável do DSH não pôde ser iniciado: ${error.message}`));
child.on('exit', (code, signal) => {
  if (starting) {
    const safeOutput = buffer.replace(/([?&]token=)[^\s&]+/gi, '$1[redacted]');
    console.error(`O processo web do DSH encerrou antes de informar a porta (código ${code}, sinal ${signal || 'nenhum'}). Saída: ${safeOutput || '(vazia)'}`);
  }
  proxy.close();
  clearInterval(tailnetTimer);
  process.exit(code ?? 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => fail('Encerrando o DSH.'));

function openBrowser() {
  spawn(process.env.ComSpec, ['/d', '/c', 'start', '', address], {
    detached: true, stdio: 'ignore', windowsHide: true,
  }).unref();
}

function fail(message) {
  console.error(message);
  proxy.close();
  clearInterval(tailnetTimer);
  child.kill();
  process.exit(1);
}
