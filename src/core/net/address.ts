import { isIP } from "node:net";

/*
 * Server-side fetches of customer-supplied URLs (brand import) must only
 * reach the public internet: never loopback, private networks, link-local
 * (cloud metadata), CGNAT, multicast or reserved ranges (SSRF).
 */

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(address: string): number {
  return address.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function isPublicV4(address: string): boolean {
  const ip = v4ToInt(address);
  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ip & mask) === (v4ToInt(base) & mask);
  });
}

/** Expands an IPv6 address into eight 16-bit groups. */
function v6Groups(address: string): number[] {
  let text = address.toLowerCase().split("%")[0]!;
  // A trailing dotted IPv4 (::ffff:10.0.0.1) becomes two groups.
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (v4) {
    const int = v4ToInt(v4);
    text = text.replace(v4, `${(int >>> 16).toString(16)}:${(int & 0xffff).toString(16)}`);
  }
  const [head, tail] = text.split("::") as [string, string | undefined];
  const parse = (part: string) =>
    part ? part.split(":").map((group) => Number.parseInt(group, 16)) : [];
  const start = parse(head);
  const end = tail === undefined ? [] : parse(tail);
  const fill = tail === undefined ? [] : new Array(8 - start.length - end.length).fill(0);
  return [...start, ...fill, ...end];
}

function isPublicV6(address: string): boolean {
  const groups = v6Groups(address);
  if (groups.length !== 8 || groups.some((group) => !Number.isFinite(group))) return false;
  const [a, b, c, d, e, f, g, h] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const embeddedV4 = `${g >> 8}.${g & 255}.${h >> 8}.${h & 255}`;
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0 || f === 0xffff)) {
    // ::, ::1, IPv4-compatible and IPv4-mapped addresses.
    return f === 0xffff ? isPublicV4(embeddedV4) : false;
  }
  if (a === 0x64 && b === 0xff9b) return isPublicV4(embeddedV4); // NAT64
  if ((a & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((a & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((a & 0xff00) === 0xff00) return false; // multicast
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return false; // discard 100::/64
  return true;
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicV4(address);
  if (version === 6) return isPublicV6(address);
  return false;
}
