// Pryzm v2 · AI Briefing (Monday Briefing)
// Mirror of `Pryzm_Dashboard_Mockup_Frank.html` § 6941-7004.

export interface AiHeader {
  crumbTrail: string[];
  title: string;                       // "Monday Briefing"
  subPills: string[];                  // "Pryzm, in the voice of a 10-year senior pricing manager"
  subStats: { label: string; value: string }[];   // "Generated 06:02 CET", "Sources 5,565 invoices..."
  actions: { id: string; label: string; toast: string; primary?: boolean }[];
}

export interface AiMemo {
  title: string;                       // "Monday Briefing — Pricing Manager — Week of Apr 27, 2026"
  fromLine: string;                    // "From: Pryzm · To: M. Weber · Generated..."
  paragraphs: { html: string }[];      // 3 paragraphs, HTML allowed
  signature: string;                   // "— Pryzm, in the voice of a 10-year senior pricing manager"
}

export type AiCardKind = 'changed' | 'selfCorrection' | 'voice';

export interface AiSideCard {
  id: string;
  kind: AiCardKind;
  title: string;
  tag?: { label: string; tone: 'amber' | 'green' | 'violet' };
  body?: string;                       // plain prose
  bodyItalic?: boolean;
  bullets?: { html: string }[];        // for "changed" card
}

export interface AiCrossLink {
  label: string;
  jumpTo: string;
}

export interface AiShell {
  header: AiHeader;
  memo: AiMemo;
  sideCards: AiSideCard[];             // exactly 3
  crossLinks: AiCrossLink[];
}
