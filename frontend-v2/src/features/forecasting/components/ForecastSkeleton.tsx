/**
 * Phase 7 — page-level loading skeleton for Forecasting.
 */
function Bar({ w, h = 10 }: { w: string; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: 'linear-gradient(90deg, #eef0f3, #f6f7f9, #eef0f3)',
        backgroundSize: '200% 100%',
        animation: 'pz-shimmer 1.4s linear infinite',
      }}
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

export function ForecastSkeleton() {
  return (
    <section
      id="screen-forecast"
      className="mx-auto max-w-[1400px] px-8 py-6"
      aria-busy="true"
      aria-label="Loading"
    >
      <style>
        {`@keyframes pz-shimmer { 0% {background-position: 0% 0;} 100% {background-position: -200% 0;} }`}
      </style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        <Bar w="120px" h={12} />
        <Bar w="320px" h={28} />
        <Bar w="540px" h={14} />
      </div>

      {/* Hero forecast chart */}
      <Card>
        <Bar w="35%" />
        <Bar w="100%" h={220} />
      </Card>

      {/* Cluster lens — 4 cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginTop: 14,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Bar w="55%" />
            <Bar w="40%" h={22} />
            <Bar w="80%" />
          </Card>
        ))}
      </div>

      {/* Walk-forward + input cost */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 12,
          marginTop: 14,
        }}
      >
        <Card>
          <Bar w="40%" />
          <Bar w="100%" h={140} />
        </Card>
        <Card>
          <Bar w="50%" />
          <Bar w="100%" h={140} />
        </Card>
      </div>

      {/* Pareto rows */}
      <Card>
        <Bar w="40%" h={14} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Bar key={i} w="100%" h={18} />
        ))}
      </Card>
    </section>
  );
}
