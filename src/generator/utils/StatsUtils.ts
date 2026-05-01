/**
 * Statistical utilities for non-uniform random data generation.
 */
export class StatsUtils {
  /**
   * Generates a random number following a Normal (Gaussian) distribution.
   * Uses the Box-Muller transform.
   * @param random A function that returns a random number between 0 and 1.
   * @param mean The average value.
   * @param stdDev The standard deviation.
   */
  static normal(random: () => number, mean: number, stdDev: number): number {
    const u = 1 - random(); // Converting [0,1) to (0,1]
    const v = random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * stdDev + mean;
  }

  /**
   * Generates a random number following a Zipf (Power Law) distribution.
   * Useful for popularity metrics (views, likes, etc).
   * @param random A function that returns a random number between 0 and 1.
   * @param n The number of elements (maximum value).
   * @param s The skewness parameter (s > 0, typical values 0.5 to 2.0).
   */
  static zipf(random: () => number, n: number, s: number): number {
    // Simplified Zipf-like generation using rejection sampling or approximation
    const p = random();
    let sum = 0;
    const c = 1 / this.harmonic(n, s);
    for (let i = 1; i <= n; i++) {
      sum += c / Math.pow(i, s);
      if (sum >= p) return i;
    }
    return n;
  }

  private static harmonic(n: number, s: number): number {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      sum += 1 / Math.pow(i, s);
    }
    return sum;
  }

  /**
   * Generates a random number following an Exponential distribution.
   * Useful for time-to-event modeling.
   * @param random A function that returns a random number between 0 and 1.
   * @param lambda The rate parameter.
   */
  static exponential(random: () => number, lambda: number): number {
    return -Math.log(1 - random()) / lambda;
  }

  /**
   * Clamps a value between min and max.
   */
  static clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }
}
