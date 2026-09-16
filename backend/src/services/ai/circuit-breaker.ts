/**
 * Circuit breaker for Vertex AI requests.
 *
 * States: CLOSED → OPEN (after failureThreshold failures) → HALF_OPEN (after cooldown) → CLOSED (on success)
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? parseInt(process.env.AI_CIRCUIT_BREAKER_THRESHOLD ?? "3", 10),
      cooldownMs: config?.cooldownMs ?? parseInt(process.env.AI_CIRCUIT_BREAKER_COOLDOWN_MS ?? "60000", 10),
    };
  }

  /** Check if requests are allowed. */
  isOpen(): boolean {
    if (this.state === "CLOSED") return false;
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.cooldownMs) {
        this.state = "HALF_OPEN";
        return false; // allow one probe request
      }
      return true; // still cooling down
    }
    return false; // HALF_OPEN allows one request
  }

  /** Record a successful request. */
  onSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  /** Record a failed request. */
  onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = "OPEN";
    }
  }

  /** Get current state for monitoring. */
  getState(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }
}

// Singleton instance
export const aiCircuitBreaker = new CircuitBreaker();
