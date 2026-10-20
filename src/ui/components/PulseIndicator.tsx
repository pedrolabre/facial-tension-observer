import { UIElement, createUIElement } from './MetricCard';

export type PulseIndicatorTone = 'active' | 'idle' | 'warning' | 'cooldown';

export type PulseIndicatorSize = 'small' | 'medium' | 'large';

export interface PulseIndicatorProps {
  readonly active?: boolean;
  readonly tone?: PulseIndicatorTone;
  readonly size?: PulseIndicatorSize;
  readonly pulseLevel?: number;
  readonly label?: string;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
}

interface ToneColorConfig {
  readonly outerBorder: string;
  readonly outerBackground: string;
  readonly middleBorder: string;
  readonly coreBackground: string;
  readonly glowColor: string;
  readonly defaultLabel: string;
}

const TONE_CONFIGS: Record<PulseIndicatorTone, ToneColorConfig> = {
  active: {
    outerBorder: 'rgba(20, 184, 166, 0.35)',
    outerBackground: 'rgba(13, 148, 136, 0.12)',
    middleBorder: 'rgba(45, 212, 191, 0.6)',
    coreBackground: '#2DD4BF',
    glowColor: '#14B8A6',
    defaultLabel: 'Inferência Ativa',
  },
  idle: {
    outerBorder: 'rgba(113, 113, 122, 0.25)',
    outerBackground: 'rgba(39, 39, 42, 0.15)',
    middleBorder: 'rgba(113, 113, 122, 0.4)',
    coreBackground: '#71717A',
    glowColor: '#52525B',
    defaultLabel: 'Aguardando',
  },
  warning: {
    outerBorder: 'rgba(245, 158, 11, 0.35)',
    outerBackground: 'rgba(217, 119, 6, 0.15)',
    middleBorder: 'rgba(251, 191, 36, 0.65)',
    coreBackground: '#FBBF24',
    glowColor: '#F59E0B',
    defaultLabel: 'Tensão Elevada',
  },
  cooldown: {
    outerBorder: 'rgba(59, 130, 246, 0.35)',
    outerBackground: 'rgba(37, 99, 235, 0.12)',
    middleBorder: 'rgba(96, 165, 250, 0.6)',
    coreBackground: '#60A5FA',
    glowColor: '#3B82F6',
    defaultLabel: 'Em Cooldown',
  },
};

const SIZE_CONFIGS: Record<PulseIndicatorSize, { outer: number; middle: number; core: number }> = {
  small: { outer: 28, middle: 18, core: 8 },
  medium: { outer: 56, middle: 36, core: 16 },
  large: { outer: 96, middle: 64, core: 28 },
};

export function PulseIndicator(props: PulseIndicatorProps): UIElement {
  const tone = props.tone ?? (props.active === false ? 'idle' : 'active');
  const size = props.size ?? 'medium';
  const toneConfig = TONE_CONFIGS[tone];
  const sizeConfig = SIZE_CONFIGS[size];
  const testId = props.testID ?? 'pulse-indicator';
  const pulseLevel = Math.max(0, Math.min(1, props.pulseLevel ?? (tone === 'idle' ? 0.2 : 0.8)));

  const coreDot = createUIElement('View', {
    testID: `${testId}-core`,
    style: {
      width: sizeConfig.core,
      height: sizeConfig.core,
      borderRadius: sizeConfig.core / 2,
      backgroundColor: toneConfig.coreBackground,
      opacity: 0.85 + pulseLevel * 0.15,
      shadowColor: toneConfig.glowColor,
      shadowOpacity: 0.8,
      shadowRadius: 8,
    },
  });

  const middleRing = createUIElement(
    'View',
    {
      testID: `${testId}-middle-ring`,
      style: {
        width: sizeConfig.middle,
        height: sizeConfig.middle,
        borderRadius: sizeConfig.middle / 2,
        borderWidth: 1.5,
        borderColor: toneConfig.middleBorder,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
      },
    },
    coreDot
  );

  const outerRing = createUIElement(
    'View',
    {
      testID: `${testId}-outer-ring`,
      style: {
        width: sizeConfig.outer,
        height: sizeConfig.outer,
        borderRadius: sizeConfig.outer / 2,
        borderWidth: 1,
        borderColor: toneConfig.outerBorder,
        backgroundColor: toneConfig.outerBackground,
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    middleRing
  );

  const children: UIElement[] = [outerRing];

  if (props.label !== undefined && props.label !== '') {
    const labelText = createUIElement(
      'Text',
      {
        testID: `${testId}-label`,
        style: {
          color: toneConfig.coreBackground,
          fontSize: size === 'small' ? 11 : 12,
          fontWeight: '600',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginTop: 8,
        },
      },
      props.label
    );
    children.push(labelText);
  }

  return createUIElement(
    'View',
    {
      testID: testId,
      accessibilityLabel: props.accessibilityLabel ?? (props.label ?? toneConfig.defaultLabel),
      style: {
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    ...children
  );
}
