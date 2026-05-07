const departments = [
  { name: 'Pricing & Analytics', color: '#7c66dc' },
  { name: 'Sales',               color: '#d97757' },
  { name: 'Operations',          color: '#3a8a5e' },
];

export function SidebarDeptList() {
  return (
    <>
      <div className="pz-nav-sub-title">
        <span>Departments</span>
        <button type="button" aria-label="Add department" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>+</button>
      </div>
      {departments.map((d) => (
        <div key={d.name} className="pz-dept-item">
          <span className="pz-dept-swatch" style={{ background: d.color }} />
          {d.name}
        </div>
      ))}
    </>
  );
}
