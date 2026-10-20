export type HapticImpactPattern = 'heavy' | 'medium' | 'light' | 'warning';

export interface HapticsAdapter {
  vibrateImpact(pattern?: HapticImpactPattern): Promise<void> | void;
}

export class MockHapticsAdapter implements HapticsAdapter {
  public readonly callHistory: HapticImpactPattern[] = [];

  vibrateImpact(pattern: HapticImpactPattern = 'heavy'): void {
    this.callHistory.push(pattern);
  }

  clear(): void {
    this.callHistory.length = 0;
  }
}

export class HapticsService {
  constructor(private readonly adapter: HapticsAdapter = new MockHapticsAdapter()) {}

  getAdapter(): HapticsAdapter {
    return this.adapter;
  }

  async triggerHeavyImpact(): Promise<void> {
    await this.adapter.vibrateImpact('heavy');
  }

  async triggerWarning(): Promise<void> {
    await this.adapter.vibrateImpact('warning');
  }

  async triggerPattern(pattern: HapticImpactPattern): Promise<void> {
    await this.adapter.vibrateImpact(pattern);
  }
}
