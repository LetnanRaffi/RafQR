export class TransferWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private active = false;
  private readonly onVisibility = () => { if (this.active && document.visibilityState === 'visible') void this.acquire(); };

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    await this.acquire();
  }

  private async acquire(): Promise<void> {
    if (!this.active || document.visibilityState !== 'visible' || !navigator.wakeLock || this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => { this.sentinel = null; });
    } catch { /* Browser or OS may refuse; UI still warns against closing the tab. */ }
  }

  async stop(): Promise<void> {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    const sentinel = this.sentinel;
    this.sentinel = null;
    await sentinel?.release();
  }
}
