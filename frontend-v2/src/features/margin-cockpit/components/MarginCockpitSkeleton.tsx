/**
 * Phase 5 P5.T10 — page-level loading skeleton.
 *
 * Matches the rough rhythm of MarginCockpitPage so the layout doesn't
 * jump when real data lands. Per-block skeletons (briefing memo, tabs)
 * are a Phase 14 enhancement tied to streaming SSR.
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

export function MarginCockpitSkeleton() {
  return (
    <div className="w-full px-6 py-6" aria-busy="true" aria-label="Loading">
      <style>
        {`@keyframes pz-shimmer { 0% {background-position: 0% 0;} 100% {background-position: -200% 0;} }`}
      </style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        <Bar w="120px" h={12} />
        <Bar w="320px" h={28} />
        <Bar w="540px" h={14} />
      </div>

      {/* health strip — 4 cells */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Bar w="60%" />
            <Bar w="35%" h={22} />
            <Bar w="80%" />
          </Card>
        ))}
      </div>

      {/* cluster chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Bar key={i} w="120px" h={28} />
        ))}
      </div>

      {/* waterfall + cost-vs-price */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Card>
          <Bar w="40%" />
          <Bar w="100%" h={140} />
        </Card>
        <Card>
          <Bar w="40%" />
          <Bar w="100%" h={140} />
        </Card>
      </div>

      {/* tabs — header + body rows */}
      <Card>
        <Bar w="50%" h={14} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} w="100%" h={18} />
        ))}
      </Card>
    </div>
  );
}
