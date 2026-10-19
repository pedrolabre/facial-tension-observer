export type MetricTone = 'neutral' | 'accent' | 'warning' | 'destructive';

export interface UIElement<P = Record<string, unknown>> {
  readonly type: string;
  readonly props: P & {
    readonly testID?: string;
    readonly accessibilityLabel?: string;
    readonly onPress?: () => void;
    readonly style?: Record<string, unknown>;
    readonly children?: readonly (UIElement | string | number | null | undefined)[];
  };
}

export function createUIElement<P extends Record<string, unknown>>(
  type: string,
  props: P,
  ...children: readonly (UIElement | string | number | null | undefined)[]
): UIElement<P> {
  return {
    type,
    props: {
      ...props,
      children: children.filter((c): c is UIElement | string | number => c !== null && c !== undefined),
    },
  };
}

export interface MetricCardProps {
  readonly id?: string;
  readonly title: string;
  readonly value: number | string;
  readonly subtitle: string;
  readonly tone?: MetricTone;
  readonly testID?: string;
  readonly onPress?: () => void;
}

const TONE_STYLES: Record<MetricTone, { border: string; valueColor: string }> = {
  neutral: {
    border: '#27272A',
    valueColor: '#FFFFFF',
  },
  accent: {
    border: '#3B82F6',
    valueColor: '#60A5FA',
  },
  warning: {
    border: '#F59E0B',
    valueColor: '#FBBF24',
  },
  destructive: {
    border: '#EF4444',
    valueColor: '#F87171',
  },
};

export function MetricCard(props: MetricCardProps): UIElement {
  const tone = props.tone ?? 'neutral';
  const toneStyle = TONE_STYLES[tone];
  const testId = props.testID ?? (props.id ? `metric-card-${props.id}` : 'metric-card');

  const titleElement = createUIElement(
    'Text',
    {
      testID: `${testId}-title`,
      style: {
        color: '#A1A1AA',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
      },
    },
    props.title
  );

  const valueElement = createUIElement(
    'Text',
    {
      testID: `${testId}-value`,
      style: {
        color: toneStyle.valueColor,
        fontSize: 32,
        fontWeight: '800',
        marginVertical: 4,
      },
    },
    String(props.value)
  );

  const subtitleElement = createUIElement(
    'Text',
    {
      testID: `${testId}-subtitle`,
      style: {
        color: '#71717A',
        fontSize: 12,
        fontStyle: 'italic',
        lineHeight: 16,
      },
    },
    props.subtitle
  );

  return createUIElement(
    'View',
    {
      testID: testId,
      accessibilityLabel: `${props.title}: ${props.value}. ${props.subtitle}`,
      onPress: props.onPress,
      style: {
        backgroundColor: '#121214',
        borderColor: toneStyle.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        marginVertical: 6,
      },
    },
    titleElement,
    valueElement,
    subtitleElement
  );
}
