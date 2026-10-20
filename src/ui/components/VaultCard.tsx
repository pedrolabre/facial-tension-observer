import { TensionCaptureRecord } from '../../services/db/schema';
import { UIElement, createUIElement } from './MetricCard';

export interface VaultCardProps {
  readonly capture: TensionCaptureRecord;
  readonly onPress?: (capture: TensionCaptureRecord) => void;
  readonly testID?: string;
}

export function formatCaptureDate(val: string | number): string {
  const num = typeof val === 'number' ? val : Date.parse(val.includes('T') ? val : `${val.replace(' ', 'T')}Z`);
  if (Number.isNaN(num)) {
    return String(val);
  }
  const date = new Date(num);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function formatRigidityScore(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  return `${Math.round(clamped * 100)}%`;
}

export function VaultCard(props: VaultCardProps): UIElement {
  const capture = props.capture;
  const isRevealed = capture.is_revealed === 1;
  const testId = props.testID ?? `vault-card-${capture.id}`;
  const formattedDate = formatCaptureDate(capture.created_at);
  const formattedRigidity = formatRigidityScore(capture.tension_score);

  if (!isRevealed) {
    const mysteryIcon = createUIElement(
      'Text',
      {
        testID: `${testId}-mystery-icon`,
        style: {
          fontSize: 32,
          marginBottom: 8,
          textAlign: 'center',
        },
      },
      '🔒'
    );

    const veiledBadge = createUIElement(
      'View',
      {
        testID: `${testId}-badge`,
        style: {
          backgroundColor: '#27272A',
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 4,
          alignSelf: 'flex-start',
          marginBottom: 8,
        },
      },
      createUIElement(
        'Text',
        {
          testID: `${testId}-badge-text`,
          style: {
            color: '#F59E0B',
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.5,
          },
        },
        '[Não revelado]'
      )
    );

    const dateText = createUIElement(
      'Text',
      {
        testID: `${testId}-date`,
        style: {
          color: '#A1A1AA',
          fontSize: 12,
          fontWeight: '500',
        },
      },
      formattedDate
    );

    const scoreText = createUIElement(
      'Text',
      {
        testID: `${testId}-score`,
        style: {
          color: '#FBBF24',
          fontSize: 14,
          fontWeight: '700',
          marginTop: 4,
        },
      },
      `Rigidez: ${formattedRigidity}`
    );

    const tapToRevealText = createUIElement(
      'Text',
      {
        testID: `${testId}-hint`,
        style: {
          color: '#71717A',
          fontSize: 11,
          fontStyle: 'italic',
          marginTop: 6,
        },
      },
      'Toque para revelar o flagra'
    );

    return createUIElement(
      'TouchableOpacity',
      {
        testID: testId,
        accessibilityLabel: `Foto velada capturada em ${formattedDate} com rigidez de ${formattedRigidity}. Toque para revelar.`,
        onPress: () => {
          if (props.onPress) {
            props.onPress(capture);
          }
        },
        style: {
          backgroundColor: '#121214',
          borderColor: '#27272A',
          borderWidth: 1,
          borderRadius: 12,
          padding: 16,
          marginVertical: 6,
        },
      },
      veiledBadge,
      mysteryIcon,
      dateText,
      scoreText,
      tapToRevealText
    );
  }

  const revealedBadge = createUIElement(
    'View',
    {
      testID: `${testId}-badge`,
      style: {
        backgroundColor: '#064E3B',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 8,
      },
    },
    createUIElement(
      'Text',
      {
        testID: `${testId}-badge-text`,
        style: {
          color: '#34D399',
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
        },
      },
      '[Revelado]'
    )
  );

  const captureIdText = createUIElement(
    'Text',
    {
      testID: `${testId}-identifier`,
      style: {
        color: '#71717A',
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
      },
    },
    `FLAGRA #${capture.id.slice(0, 8)}`
  );

  const dateText = createUIElement(
    'Text',
    {
      testID: `${testId}-date`,
      style: {
        color: '#A1A1AA',
        fontSize: 12,
        fontWeight: '500',
        marginTop: 2,
      },
    },
    formattedDate
  );

  const scoreText = createUIElement(
    'Text',
    {
      testID: `${testId}-score`,
      style: {
        color: '#60A5FA',
        fontSize: 14,
        fontWeight: '700',
        marginTop: 4,
      },
    },
    `Rigidez: ${formattedRigidity}`
  );

  const quoteElement = capture.applied_quote
    ? createUIElement(
        'Text',
        {
          testID: `${testId}-quote`,
          style: {
            color: '#E4E4E7',
            fontSize: 13,
            fontStyle: 'italic',
            marginTop: 8,
            lineHeight: 18,
          },
        },
        `"${capture.applied_quote}"`
      )
    : null;

  const viewedIndicator = createUIElement(
    'Text',
    {
      testID: `${testId}-viewed-indicator`,
      style: {
        color: '#52525B',
        fontSize: 10,
        fontWeight: '500',
        marginTop: 8,
      },
    },
    capture.revealed_at ? `Visualizado em ${formatCaptureDate(capture.revealed_at)}` : 'Visualizado'
  );

  return createUIElement(
    'TouchableOpacity',
    {
      testID: testId,
      accessibilityLabel: `Foto revelada capturada em ${formattedDate} com rigidez de ${formattedRigidity}.`,
      onPress: () => {
        if (props.onPress) {
          props.onPress(capture);
        }
      },
      style: {
        backgroundColor: '#18181B',
        borderColor: '#3F3F46',
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        marginVertical: 6,
      },
    },
    revealedBadge,
    captureIdText,
    dateText,
    scoreText,
    quoteElement,
    viewedIndicator
  );
}
