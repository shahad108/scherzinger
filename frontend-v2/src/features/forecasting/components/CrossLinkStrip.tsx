export function CrossLinkStrip() {
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
        <button type="button" className="head-pill">
          Action queue → Action Center
        </button>
        <button type="button" className="head-pill">
          Negotiation cockpit → Action Center
        </button>
        <button type="button" className="head-pill">
          SKU drill → Pricing Studio
        </button>
      </div>
    </div>
  );
}
