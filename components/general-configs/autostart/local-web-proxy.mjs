import http from 'node:http';
import os from 'node:os';

const PORT = 3080;
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade']);

function normalizeAddress(address) {
  return String(address || '').toLowerCase().replace(/^::ffff:/, '').split('%', 1)[0];
}
function ipv4ToInteger(address) {
  const parts = normalizeAddress(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
function isPrivateIpv4(address) {
  const parts = normalizeAddress(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}
function isLocalLanPeer(address) {
  const peer = normalizeAddress(address);
  const peerValue = ipv4ToInteger(peer);
  if (peerValue === null || !isPrivateIpv4(peer)) return false;
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if ((entry.family !== 'IPv4' && entry.family !== 4) || entry.internal || !isPrivateIpv4(entry.address)) continue;
      const localValue = ipv4ToInteger(entry.address);
      const maskValue = ipv4ToInteger(entry.netmask);
      if (localValue !== null && maskValue !== null &&
          ((peerValue & maskValue) >>> 0) === ((localValue & maskValue) >>> 0)) return true;
    }
  }
  return false;
}
function isLoopback(address) {
  const value = normalizeAddress(address);
  return value === '::1' || value.startsWith('127.');
}
function addressFromHost(host) {
  const value = String(host || '').toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 0 ? value.slice(1, end) : value;
  }
  return value.replace(/:\d+$/, '');
}
function hostWithPort(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return null;
  return value.includes(':') ? value : `${value}:${PORT}`;
}
function headersWithoutHop(headers) {
  const result = {};
  const names = String(headers.connection || '').toLowerCase().split(',').map(x => x.trim());
  for (const [key, value] of Object.entries(headers)) {
    if (!HOP.has(key) && !names.includes(key)) result[key] = value;
  }
  return result;
}

export class LocalWeb {
  constructor(address = '127.0.0.1', names = []) {
    this.bindAddress = address;
    this.hosts = [];
    this.setHostNames(names);
    this.tailnetPeers = new Set();
    this.server = null;
    this.sockets = new Set();
    this.address = null;
    this.target = null;
    this.upstreamAuth = null;
    this.authUntil = 0;
  }

  state() {
    if (!this.address || !this.server?.listening) return {};
    const preferred = this.bindAddress === '0.0.0.0' ? '127.0.0.1' : this.bindAddress;
    return { address: `http://${preferred}:${PORT}`, ipAddress: `http://${preferred}:${PORT}` };
  }

  setHostNames(names) {
    const boundName = this.bindAddress === '0.0.0.0' ? [] : [this.bindAddress];
    this.hosts = [...new Set([...boundName, ...names].map(hostWithPort).filter(Boolean))];
  }

  setTailnetPeers(addresses) {
    this.tailnetPeers = new Set((addresses || []).map(normalizeAddress).filter(Boolean));
  }

  async open(url) {
    const ip = this.bindAddress;
    if (!ip) { this.close(); return { unavailable: 'Endereço local indisponível.' }; }
    if (this.target !== url) { this.target = url; this.upstreamAuth = null; this.authUntil = 0; }
    if (this.address === ip && this.server?.listening) return this.state();
    if (this.server) {
      this.close();
      this.target = url;
    }
    const server = http.createServer({ requestTimeout: 20000, headersTimeout: 10000 }, (req, res) => {
      this.handle(req, res).catch(() => {
        if (res.headersSent) res.destroy();
        else res.writeHead(502).end('O DSH ainda não está disponível.');
      });
    });
    server.on('upgrade', (req, socket, head) => this.upgrade(req, socket, head));
    server.on('connection', socket => {
      if (!this.allowedPeer(socket.remoteAddress)) {
        socket.destroy();
        return;
      }
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
    this.server = server;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(PORT, ip, resolve);
      });
      if (server !== this.server) return {};
      this.address = ip;
      return this.state();
    } catch {
      if (server === this.server) this.close();
      return { unavailable: 'Não foi possível abrir a porta 3080 no endereço local.' };
    }
  }

  close() {
    const server = this.server;
    this.server = null;
    this.address = null;
    this.target = null;
    this.upstreamAuth = null;
    this.authUntil = 0;
    if (server) {
      server.close();
      for (const socket of this.sockets) socket.destroy();
    }
  }

  origin(req) {
    const host = String(req.headers.host || '').toLowerCase();
    const requestedAddress = addressFromHost(host);
    const allowedHost = this.hosts.includes(host) || this.tailnetPeers.has(normalizeAddress(requestedAddress)) ||
      (this.bindAddress === '0.0.0.0' && isLocalLanPeer(requestedAddress));
    return this.allowedPeer(req.socket.remoteAddress) && this.address && allowedHost
      ? 'http://' + host : null;
  }

  allowedPeer(address) {
    const peer = normalizeAddress(address);
    return isLoopback(peer) || this.tailnetPeers.has(peer) ||
      (this.bindAddress === '0.0.0.0' && isLocalLanPeer(peer));
  }

  async credentials() {
    if (!this.target) throw new Error('DSH indisponível');
    if (!this.upstreamAuth || this.authUntil <= Date.now()) {
      this.authUntil = Date.now() + 5 * 60_000;
      this.upstreamAuth = new Promise((resolve, reject) => {
        const url = new URL(this.target);
        const req = http.get(url, { timeout: 5000 }, res => {
          res.resume();
          const cookie = (res.headers['set-cookie'] || []).find(item => item.startsWith('dsh-auth-'));
          if (!cookie || ![302, 303].includes(res.statusCode)) return reject(new Error('Login local indisponível'));
          resolve({ port: url.port, host: url.host, cookie: cookie.split(';', 1)[0] });
        });
        req.on('timeout', () => req.destroy(new Error('Timeout')));
        req.on('error', reject);
      }).catch(error => { this.upstreamAuth = null; throw error; });
    }
    return this.upstreamAuth;
  }

  upstreamHeaders(req, auth) {
    const headers = headersWithoutHop(req.headers);
    headers.host = auth.host;
    headers.cookie = auth.cookie;
    if (headers.origin) headers.origin = 'http://' + auth.host;
    for (const key of ['referer', 'forwarded', 'x-forwarded-host', 'x-forwarded-for',
      'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'authorization']) delete headers[key];
    return headers;
  }

  async handle(req, res) {
    const origin = this.origin(req);
    if (!origin || !req.url?.startsWith('/') || req.url.startsWith('//')) return res.writeHead(400).end();
    if (req.method === 'GET' && req.url === '/__dsh_health') {
      try {
        await this.credentials();
        if (!res.destroyed) res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/plain' }).end('ok');
      } catch {
        if (!res.destroyed) res.writeHead(503, { 'cache-control': 'no-store', 'content-type': 'text/plain' }).end('unavailable');
      }
      return;
    }
    const opening = req.method === 'GET' && req.url === '/' && req.headers['sec-fetch-mode'] === 'navigate'
      && req.headers['sec-fetch-dest'] === 'document';
    if ((!opening && req.headers['sec-fetch-site'] === 'cross-site') ||
        (req.headers.origin && req.headers.origin !== origin) ||
        (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin)) {
      return res.writeHead(403).end();
    }
    const auth = await this.credentials();
    if (res.destroyed) return;
    const upstream = http.request({
      host: '127.0.0.1', port: auth.port, method: req.method, path: req.url,
      headers: this.upstreamHeaders(req, auth),
    }, response => {
      const headers = headersWithoutHop(response.headers);
      delete headers['set-cookie'];
      const prefix = 'http://' + auth.host;
      if (headers.location?.startsWith(prefix + '/')) headers.location = headers.location.slice(prefix.length);
      headers['x-dsh-local'] = '1';
      res.writeHead(response.statusCode, headers);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    res.once('close', () => upstream.destroy());
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else if (!res.destroyed) res.writeHead(502).end();
    });
    req.pipe(upstream);
  }

  upgrade(req, socket, head) {
    socket.on('error', () => socket.destroy());
    const origin = this.origin(req);
    if (!origin || req.headers.origin !== origin ||
        !req.url?.startsWith('/') || req.url.startsWith('//') || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    socket.pause();
    this.credentials().then(auth => {
      if (socket.destroyed) return;
      const headers = this.upstreamHeaders(req, auth);
      headers.connection = 'Upgrade';
      headers.upgrade = 'websocket';
      const upstream = http.request({ host: '127.0.0.1', port: auth.port, path: req.url, headers, timeout: 10000 });
      socket.once('close', () => upstream.destroy());
      upstream.on('timeout', () => { upstream.destroy(); socket.destroy(); });
      upstream.on('error', () => socket.destroy());
      upstream.on('response', res => { res.resume(); socket.destroy(); });
      upstream.on('upgrade', (res, peer, upstreamHead) => {
        upstream.setTimeout(0);
        peer.on('error', () => socket.destroy());
        peer.once('close', () => socket.destroy());
        socket.once('close', () => peer.destroy());
        let response = 'HTTP/1.1 101 Switching Protocols\r\n';
        for (const [key, value] of Object.entries(res.headers)) if (key !== 'set-cookie') response += key + ': ' + value + '\r\n';
        socket.write(response + '\r\n');
        if (upstreamHead.length) socket.write(upstreamHead);
        if (head.length) peer.write(head);
        socket.pipe(peer).pipe(socket);
        socket.resume();
      });
      upstream.end();
    }).catch(() => socket.destroy());
  }
}
