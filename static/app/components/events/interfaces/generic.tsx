import {useState} from 'react';

import {SegmentedControl} from 'sentry/components/core/segmentedControl';
import KeyValueList from 'sentry/components/events/interfaces/keyValueList';
import {AnnotatedText} from 'sentry/components/events/meta/annotatedText';
import {t} from 'sentry/locale';
import {InterimSection} from 'sentry/views/issueDetails/streamline/interimSection';

function getView({
  data,
  meta,
  view,
}: {
  data: Props['data'];
  view: View;
  meta?: Record<any, any>;
}) {
  switch (view) {
    case 'report':
      return data ? (
        <KeyValueList
          data={Object.entries(data).map(([key, value]) => ({
            key,
            value,
            subject: key,
            meta: meta?.[key]?.[''],
          }))}
          isContextData
        />
      ) : (
        <AnnotatedText value={data} meta={meta?.['']} />
      );
    case 'raw':
      return <pre>{JSON.stringify({'csp-report': data}, null, 2)}</pre>;
    default:
      throw new TypeError(`Invalid view: ${view}`);
  }
}

type Props = {
  data: Record<string, any> | null;
  type: string;
  meta?: Record<string, any>;
};

type View = 'report' | 'raw';

export function Generic({type, data, meta}: Props) {
  const [view, setView] = useState<View>('report');
  return (
    <InterimSection
      type={type}
      title={t('Report')}
      actions={
        <SegmentedControl
          aria-label={t('View')}
          size="xs"
          value={view}
          onChange={setView}
        >
          <SegmentedControl.Item key="report">{t('Report')}</SegmentedControl.Item>
          <SegmentedControl.Item key="raw">{t('Raw')}</SegmentedControl.Item>
        </SegmentedControl>
      }
    >
      {getView({view, data, meta})}
    </InterimSection>
  );
}
