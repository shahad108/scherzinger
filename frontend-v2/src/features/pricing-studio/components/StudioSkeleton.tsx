/**
 * Phase 8 — page-level loading skeleton for Pricing Studio.
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

export function StudioSkeleton() {
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

      {/* SKU picker rail + workbench main split */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14 }}>
        <Card>
          <Bar w="60%" h={14} />
          {Array.from({ length: 8 }).map((_, i) => (
            <Bar key={i} w="100%" h={20} />
          ))}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <Bar w="35%" />
            <Bar w="80%" h={28} />
            <Bar w="60%" />
            <Bar w="100%" h={120} />
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <Bar w="55%" />
                <Bar w="35%" h={22} />
                <Bar w="80%" />
              </Card>
            ))}
          </div>
          <Card>
            <Bar w="40%" />
            <Bar w="100%" h={140} />
          </Card>
        </div>
      </div>
    </div>
  );
}
