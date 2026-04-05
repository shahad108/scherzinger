// Central animation variants for motion/react
// Premium, smooth motion configs — single source of truth

// ── Stagger orchestrators ──
export const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

export const containerFastVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

// ── Card entrance ──
export const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
};

// ── Chart entrance (slightly larger movement + subtle scale) ──
export const chartVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] } },
};

// ── Table entrance ──
export const tableVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
};

// ── Slide-over panel ──
export const slideOverVariants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: { type: 'spring', damping: 28, stiffness: 280, mass: 0.8 } },
  exit: { x: '100%', transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } },
};

// ── Slide-over backdrop ──
export const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

// ── Slide-over content stagger ──
export const slideOverSectionVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export const slideOverItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

// ── Dropdown (search results, notifications) ──
export const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } },
  exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
};

// ── Page route transition ──
export const pageTransitionVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

// ── Hover effect ──
export const cardHover = {
  y: -2,
  transition: { duration: 0.2, ease: 'easeInOut' },
  boxShadow: '0 12px 40px rgba(26, 26, 46, 0.08)',
};

// ── Viewport trigger config ──
export const viewportOnce = { once: true, margin: '-60px' };
