import { useUiAction } from '@/hooks/useUiAction';

const departments = [
  { name: 'Pricing & Analytics', color: '#7c66dc' },
  { name: 'Sales',               color: '#d97757' },
  { name: 'Operations',          color: '#3a8a5e' },
];

export function SidebarDeptList() {
  const runAction = useUiAction();

  return (
    <>
      <div className="pz-nav-sub-title">
        <span>Departments</span>
        <button
          type="button"
          aria-label="Add department"
          className="pz-nav-add"
          onClick={() =>
            runAction({
              drawer: {
                title: 'Add department',
                description: 'Department creation changes workspace permissions and saved-view defaults, so it needs the admin endpoint.',
                items: [
                  { label: 'Existing', value: departments.map((d) => d.name).join(', ') },
                  { label: 'Backend gap', value: 'Department management endpoint' },
                ],
              },
              toast: 'Department setup opened',
              toastSeverity: 'info',
            })
          }
        >
          +
        </button>
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
