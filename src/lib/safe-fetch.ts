import { lookup as dnsLookupPromise } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';
import ipaddr from 'ipaddr.js';

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = 'AgentDeskBot/1.0 (+https://agentdesk.ai/bot; support knowledge crawler)';

export function validatePublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid public website URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only public HTTP or HTTPS website URLs are supported.');
  }
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) {
    throw new Error('Website URLs on custom ports are not supported.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private and local network addresses are not allowed.');
  }
  if (isIP(hostname) && !isPublicIp(hostname)) {
    throw new Error('Private and reserved network addresses are not allowed.');
  }
  url.hostname = hostname;
  url.hash = '';
  return url;
}

export function isPublicIp(value: string): boolean {
  try {
    let address = ipaddr.parse(value);
    if (address.kind() === 'ipv6' && (address as ipaddr.IPv6).isIPv4MappedAddress()) {
      address = (address as ipaddr.IPv6).toIPv4Address();
    }
    return address.range() === 'unicast';
  } catch {
    return false;
  }
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: number }> {
  const bareHost = hostname.replace(/^\[|\]$/g, '');
  if (isIP(bareHost)) {
    if (!isPublicIp(bareHost)) throw new Error('Private and reserved destinations are not allowed.');
    return { address: bareHost, family: isIP(bareHost) };
  }
  const addresses = await dnsLookupPromise(bareHost, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Website resolves to a private or reserved network address.');
  }
  return { address: addresses[0].address, family: addresses[0].family };
}

export async function validatePublicDestination(input: string): Promise<URL> {
  const url = validatePublicHttpUrl(input);
  await resolvePublicAddress(url.hostname);
  return url;
}

type FetchResult = { status: number; contentType: string; body: string; location?: string };

async function requestPinned(url: URL): Promise<FetchResult> {
  const destination = await resolvePublicAddress(url.hostname);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: 'GET',
      agent: false,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
      },
      lookup: ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
        callback(null, destination.address, destination.family);
      }) as typeof dnsLookupPromise,
    });
    const timeout = setTimeout(() => req.destroy(new Error('Website request timed out.')), FETCH_TIMEOUT_MS);
    req.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    req.on('response', (res) => {
      const status = res.statusCode || 0;
      const location = typeof res.headers.location === 'string' ? res.headers.location : undefined;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        res.resume();
        clearTimeout(timeout);
        resolve({ status, contentType: '', body: '', location });
        return;
      }
      const contentType = res.headers['content-type'] || '';
      const declaredSize = Number(res.headers['content-length'] || 0);
      if (declaredSize > MAX_RESPONSE_BYTES) {
        res.destroy(new Error('Website page exceeds the allowed response size.'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          res.destroy(new Error('Website page exceeds the allowed response size.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        clearTimeout(timeout);
        resolve({ status, contentType: String(contentType), body: Buffer.concat(chunks).toString('utf8') });
      });
      res.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    req.end();
  });
}

export async function safeFetchHtml(input: string): Promise<{ url: URL; contentType: string; body: string; status: number }> {
  let current = validatePublicHttpUrl(input);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const result = await requestPinned(current);
    if (result.location) {
      if (redirects === MAX_REDIRECTS) throw new Error('Website redirected too many times.');
      current = validatePublicHttpUrl(new URL(result.location, current).toString());
      continue;
    }
    return { url: current, contentType: result.contentType, body: result.body, status: result.status };
  }
  throw new Error('Website could not be fetched safely.');
}
