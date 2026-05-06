import { MessageStrip } from '@/components/fiori/MessageStrip';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useActionCards } from '@/data/api/useActionCards';
import { fmt } from '@/lib/format';

export function ActionCenterPage() {
  const { data, isLoading, error } = useActionCards();

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Aktionszentrale</h1>
          <p className="text-sm text-gray-600">Frank · {new Date().toLocaleDateString('de-DE')}</p>
        </div>
      </div>
      <MessageStrip severity="info" closable className="mb-4">
        Phase 0 Foundation — placeholder cards rendered from mock JSON.
      </MessageStrip>
      {isLoading && <div className="text-sm text-gray-500">Lade…</div>}
      {error && <div className="text-sm text-red-600">Fehler: {(error as Error).message}</div>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data?.map((card) => (
          <Card key={card.id}>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>{card.title}</CardTitle>
              <Badge
                tone={
                  card.severity === 'error'
                    ? 'negative'
                    : card.severity === 'warning'
                      ? 'warning'
                      : card.severity === 'success'
                        ? 'positive'
                        : 'info'
                }
              >
                {card.type}
              </Badge>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-600">{card.subtitle}</p>
              {card.amount !== undefined && (
                <p className="mt-2 text-lg font-semibold tabular-nums">{fmt.eur(card.amount)}</p>
              )}
              {card.recommendedAction && (
                <p className="mt-2 text-xs text-gray-500">→ {card.recommendedAction}</p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ActionCenterPage;
