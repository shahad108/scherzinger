import type { HeroChipData } from '@/types/studio';
import { renderInline } from './renderInline';

export interface HeroView {
  eyebrow: string;
  title: string;
  sub: string;
  chips: HeroChipData[];
  meta: string;
  currentPrice: string;
  currentMargin: string;
  currentMarginTone: 'bad' | 'good';
  targetText: string;
}

interface Props {
  hero: HeroView;
}

export function WorkbenchHero({ hero }: Props) {
  return (
    <div className="ws-hero">
      <div>
        <div className="ws-hero-eyebrow">{hero.eyebrow}</div>
        <h3>{hero.title}</h3>
        <div className="ws-hero-sub">{renderInline(hero.sub)}</div>
        <div className="ws-hero-chips">
          {hero.chips.map((c, i) => (
            <span key={i} className={c.variant ?? ''}>
              {c.label}
            </span>
          ))}
        </div>
        <div className="ws-hero-meta">{renderInline(hero.meta)}</div>
      </div>
      <div className="ws-hero-num">
        <div className="ws-cur">{hero.currentPrice}</div>
        <div className={`ws-marg-now ${hero.currentMarginTone}`}>{hero.currentMargin}</div>
        <div className="ws-target">{hero.targetText}</div>
      </div>
    </div>
  );
}
