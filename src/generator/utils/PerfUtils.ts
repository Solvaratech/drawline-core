/**
 * High-performance utilities for deterministic test data generation.
 * Replaces heavy cryptographic hashes (SHA-256) with lightweight FNV-1a
 * and integrates the xoshiro128** PRNG for maximum throughput.
 */

/**
 * FNV-1a 32-bit Hash implementation for speed and good distribution.
 * Higher speed than SHA-256 for non-security-critical deterministic IDs.
 */
export function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/**
 * xoshiro128** 1.1 PRNG implementation.
 * Extremely fast and passes all statistical tests.
 */
export class Xoshiro128 {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    this.seed(seed);
  }

  private seed(seed: number) {
    // Seed using SplitMix64 or similar to fill the 4 states
    let t = seed + 0x9e3779b9;
    for (let i = 0; i < 4; i++) {
      t = Math.imul(t ^ (t >>> 30), 0xbf58476d1ce4e5b9);
      t = Math.imul(t ^ (t >>> 27), 0x94d049bb133111eb);
      this.s[i] = t ^ (t >>> 31);
      t += 0x9e3779b9;
    }
  }

  next(): number {
    const s = this.s;
    const result = (this.rotl(Math.imul(s[1], 5), 7) * 9) >>> 0;
    const t = s[1] << 9;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = this.rotl(s[3], 11);

    return result / 4294967296;
  }

  private rotl(x: number, k: number): number {
    return (x << k) | (x >>> (32 - k));
  }
}

/**
 * Deterministic UUID generation using FNV-1a.
 * Much faster than SHA-256 while maintaining uniqueness for typical test volumes.
 */
export function generateFastDeterministicUUID(input: string): string {
  // Use multiple FNV-1a variations to fill 128 bits if needed, 
  // or just use 32-bit chunks.
  const h1 = fnv1a(input + "_1");
  const h2 = fnv1a(input + "_2");
  const h3 = fnv1a(input + "_3");
  const h4 = fnv1a(input + "_4");

  const hex = (h: number) => h.toString(16).padStart(8, "0");
  
  const s1 = hex(h1);
  const s2 = hex(h2);
  const s3 = hex(h3);
  const s4 = hex(h4);

  return `${s1}-${s2.substring(0, 4)}-${s2.substring(4, 8)}-${s3.substring(0, 4)}-${s3.substring(4, 8)}${s4}`;
}
