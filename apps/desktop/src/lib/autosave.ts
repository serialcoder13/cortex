/**
 * AutoSave — debounced persistence manager.
 *
 * Buffers the latest content for a given path and flushes it to the provided
 * `saveFn` after `debounceMs` of inactivity.  Calling `schedule()` resets the
 * timer so that rapid edits are coalesced into a single write.
 */
export class AutoSave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: { path: string; content: string } | null = null;
  private saveFn: (path: string, content: string) => Promise<void>;
  private debounceMs: number;
  private flushing = false;

  constructor(
    saveFn: (path: string, content: string) => Promise<void>,
    debounceMs = 60_000,
  ) {
    this.saveFn = saveFn;
    this.debounceMs = debounceMs;
  }

  /**
   * Schedule (or re-schedule) an auto-save.
   *
   * If a timer is already running it is reset so the actual write only happens
   * after `debounceMs` of *silence*.
   */
  schedule(path: string, content: string): void {
    this.pending = { path, content };

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.executeSave();
    }, this.debounceMs);
  }

  /** Immediately persist any buffered content, bypassing the debounce timer. */
  async flush(): Promise<void> {
    this.clearTimer();

    if (this.pending && !this.flushing) {
      await this.executeSave();
    }
  }

  /** Cancel the pending save without writing anything. */
  cancel(): void {
    this.clearTimer();
    this.pending = null;
  }

  /** Cancel any pending work and release resources. */
  destroy(): void {
    this.cancel();
    // Clear references so the GC can collect the closure.
    this.saveFn = async () => {};
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async executeSave(): Promise<void> {
    if (!this.pending) return;

    const { path, content } = this.pending;
    this.pending = null;
    this.flushing = true;

    try {
      await this.saveFn(path, content);
    } finally {
      this.flushing = false;
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
