export type Rng = {
  next: () => number
  int: (maxExclusive: number) => number
}

// Mulberry32: fast deterministic RNG.
export function createRng(seed: number): Rng {
  let t = seed >>> 0
  const next = () => {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
  }
}

export function shuffleInPlace<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

