import { useTranslation } from 'react-i18next';
import { MessageStrip } from '@/components/fiori/MessageStrip';

function PlaceholderPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight">
        {t('nav.ai')}
      </h1>
      <MessageStrip severity="info">
        Phase 0 placeholder — feature ships in a later phase.
      </MessageStrip>
    </div>
  );
}

export default PlaceholderPage;
