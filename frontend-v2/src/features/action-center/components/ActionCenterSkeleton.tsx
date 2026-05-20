/**
 * Skeleton for the entire Action Center page.
 *
 * Per Phase 4 §10.2 P4.T13 the long-term goal is per-block skeletons that
 * fade in independently as their data resolves. The composer endpoint
 * returns all blocks atomically today, so a single page-level skeleton
 * is correct for now; refactoring to block-level skeletons is a Phase 14
 * follow-up tied to streaming-SSR.
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

export function ActionCenterSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6" aria-busy="true" aria-label="Loading">
      <style>
        {`@keyframes pz-shimmer { 0% {background-position: 0% 0;} 100% {background-position: -200% 0;} }`}
      </style>

      {/* PageHead */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        <Bar w="120px" h={12} />
        <Bar w="280px" h={28} />
        <Bar w="540px" h={14} />
      </div>

      {/* MovableHero */}
      <Card>
        <Bar w="160px" h={14} />
        <Bar w="60%" h={26} />
        <Bar w="40%" h={10} />
        <Bar w="100%" h={48} />
      </Card>

      {/* BucketFilterRow: chip strip placeholder */}
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
            <Bar w="50%" />
            <Bar w="80%" />
            <Bar w="40%" />
          </Card>
        ))}
      </div>

      {/* DecisionCards: 3 columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 12,
          marginTop: 14,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Bar w="40%" />
            <Bar w="90%" h={14} />
            <Bar w="70%" />
            <Bar w="50%" />
          </Card>
        ))}
      </div>

      {/* TrustStrip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginTop: 14,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Bar w="60%" />
            <Bar w="35%" h={20} />
            <Bar w="80%" />
          </Card>
        ))}
      </div>

      {/* SkuTable rows */}
      <Card>
        <Bar w="180px" h={14} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} w="100%" h={18} />
        ))}
      </Card>
    </div>
  );
}
