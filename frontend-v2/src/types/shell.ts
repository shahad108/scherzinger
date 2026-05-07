export type NotifTone = 'ok' | 'info' | 'warn';

export interface ShellNotification {
  id: string;
  tone: NotifTone;
  title: string;
  sub: string;
  unread: boolean;
}

export interface ShellReviewer {
  id: string;
  initials: string;
  bg: string;
}

export interface ShellSection {
  id: string;
  title: string;
  sub: string;
  href: string;
}

export interface ShellRailData {
  notifications: ShellNotification[];
  reviewers: { panelLabel: string; people: ShellReviewer[]; extraCount: number };
  sections: ShellSection[];
}
