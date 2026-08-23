/**
 * Reject IPv4 addresses that are private/loopback/link-local/reserved/etc.
 */
export function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 88) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224 && a <= 239) return true;
  if (a >= 240) return true;
  return false;
}

function parseIPv4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

/**
 * Parse an IPv6 literal into eight 16-bit groups. Dotted IPv4 endings are
 * normalized to their two hexadecimal groups so mapped forms have one shape.
 */
function parseIPv6Groups(ip: string): number[] | null {
  const address = ip.toLowerCase().split("%")[0];
  if (!address || address.split("::").length > 2) return null;

  const [left, right] = address.split("::");
  const parseSide = (side: string | undefined): number[] | null => {
    if (!side) return [];
    const chunks = side.split(":");
    const groups: number[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (chunk.includes(".")) {
        if (index !== chunks.length - 1) return null;
        const ipv4 = parseIPv4Parts(chunk);
        if (!ipv4) return null;
        groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(chunk)) return null;
      groups.push(Number.parseInt(chunk, 16));
    }
    return groups;
  };

  const leftGroups = parseSide(left);
  const rightGroups = parseSide(right);
  if (!leftGroups || !rightGroups) return null;

  if (address.includes("::")) {
    const zeroGroups = 8 - leftGroups.length - rightGroups.length;
    return zeroGroups >= 1 ? [...leftGroups, ...Array(zeroGroups).fill(0), ...rightGroups] : null;
  }
  return leftGroups.length === 8 ? leftGroups : null;
}

/** Reject IPv6 addresses that are loopback/link-local/ULA/multicast/reserved/etc. */
export function isBlockedIPv6(ip: string): boolean {
  const groups = parseIPv6Groups(ip);
  if (!groups) return true;

  // IPv4-mapped addresses can be represented in dotted or hexadecimal form,
  // e.g. ::ffff:127.0.0.1 and ::ffff:7f00:1. Normalize both before checking.
  const isIPv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIPv4Mapped) {
    return isBlockedIPv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join("."));
  }

  const [head] = groups;
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  if ((head & 0xfe00) === 0xfc00) return true;
  if ((head & 0xffc0) === 0xfe80) return true;
  if ((head & 0xff00) === 0xff00) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) return true;
  return false;
}