export function SidebarDataStatus() {
  return (
    <div className="pz-promo">
      <div className="ds-row">
        <span className="ds-dot" />
        <div>
          <div className="ds-t">Data fresh</div>
          <div className="ds-s">Last sync 8 min ago</div>
        </div>
      </div>
      <div className="ds-divider" />
      <div className="ds-row">
        <div>
          <div className="ds-t">My saved views</div>
          <div className="ds-s">3 · Margin watch, BKAES, Renewals</div>
        </div>
      </div>
      <button type="button" className="pz-promo-cta">Open saved views</button>
    </div>
  );
}
