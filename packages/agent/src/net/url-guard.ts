import dns from 'node:dns';
import ipaddr from 'ipaddr.js';

/** Thrown when a URL points at (or resolves to) anything that isn't the public internet. */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) => {
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/**
 * True only for globally routable unicast addresses. Everything else is refused: loopback,
 * RFC1918 private, link-local (incl. 169.254.169.254 cloud metadata), CGNAT, unique-local,
 * multicast, reserved, and IPv6 transition ranges. IPv4-mapped IPv6 (::ffff:10.0.0.1) is
 * unwrapped first so it can't smuggle a private IPv4 past the check.
 */
export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) addr = (addr as ipaddr.IPv6).toIPv4Address();
  return addr.range() === 'unicast';
}

/**
 * Validates a URL an agent wants to open: http/https only, no credentials, and EVERY address the
 * host resolves to must be public. Returns the parsed URL.
 *
 * This is the first line of defence. Because DNS can answer differently on the real connection
 * (rebinding), the actual socket is also pinned through {@link guardedLookup}, and the browser
 * worker adds a network-level egress proxy on top (playbook H3).
 */
export async function assertPublicUrl(raw: string, resolver: Resolver = systemResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('URL tidak valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrlError('Hanya URL http/https yang diizinkan.');
  if (url.username || url.password) throw new UnsafeUrlError('URL dengan kredensial tidak diizinkan.');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(host)) {
    if (!isPublicIp(host)) throw new UnsafeUrlError('Alamat IP non-publik diblokir.');
    return url;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('Host lokal diblokir.');
  }

  let addresses: string[];
  try {
    addresses = await resolver(host);
  } catch {
    throw new UnsafeUrlError('Host tidak dapat di-resolve.');
  }
  if (addresses.length === 0) throw new UnsafeUrlError('Host tidak dapat di-resolve.');
  if (!addresses.every(isPublicIp)) throw new UnsafeUrlError('Host mengarah ke alamat non-publik dan diblokir.');
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/**
 * A `lookup` function for http(s).request that validates at connect time. The socket then
 * connects to the very address that passed the check, which closes the DNS-rebinding gap between
 * "check" and "connect".
 */
export function guardedLookup(resolver: Resolver = systemResolver) {
  return (hostname: string, options: dns.LookupOptions | LookupCallback, callback?: LookupCallback): void => {
    const cb = (typeof options === 'function' ? options : callback)!;
    const wantsAll = typeof options === 'object' && options.all === true;
    resolver(hostname)
      .then((addresses) => {
        if (addresses.length === 0 || !addresses.every(isPublicIp)) {
          cb(Object.assign(new Error('Alamat non-publik diblokir.'), { code: 'EUNSAFE' }) as NodeJS.ErrnoException, '');
          return;
        }
        const records = addresses.map((address) => ({ address, family: ipaddr.parse(address).kind() === 'ipv6' ? 6 : 4 }));
        if (wantsAll) cb(null, records);
        else cb(null, records[0]!.address, records[0]!.family);
      })
      .catch((err: NodeJS.ErrnoException) => cb(err, ''));
  };
}
