import { BRAND } from '../../utils/brand';

export default function Footer() {
  return (
    <footer className="px-8 py-6 text-center mt-8" style={{ borderTop: '1px solid rgba(26,26,46,0.04)' }}>
      <p className="text-xs font-medium" style={{ color: '#a3a3a3' }}>
        PRYZM Analytics | {BRAND.companyFull}
      </p>
    </footer>
  );
}
