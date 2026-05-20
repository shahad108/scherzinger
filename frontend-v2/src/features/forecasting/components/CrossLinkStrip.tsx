// CrossLinkStrip — Phase 4.5 audit fix:
// Wire the three bottom-strip pills to real routes (previously they were dead
// `<button>` elements with no onClick).
import { useNavigate } from 'react-router-dom';

export function CrossLinkStrip() {
  const navigate = useNavigate();
  return (
    <div
      className="lq-card"
      style={{
        marginTop: 14,
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Where to act on this:</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="head-pill"
          data-testid="cross-link-action-queue"
          onClick={() => navigate('/action-center')}
        >
          Action queue → Action Center
        </button>
        <button
          type="button"
          className="head-pill"
          data-testid="cross-link-negotiation"
          onClick={() => navigate('/action-center?tab=negotiation')}
        >
          Negotiation cockpit → Action Center
        </button>
        <button
          type="button"
          className="head-pill"
          data-testid="cross-link-sku-drill"
          onClick={() => navigate('/pricing?view=skus')}
        >
          SKU drill → Pricing Studio
        </button>
      </div>
    </div>
  );
}
