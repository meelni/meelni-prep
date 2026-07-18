import {
  BarChart3,
  BookOpen,
  History,
  Monitor,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface DashboardNavigationItem {
  id: DashboardNavigationSection;
  icon: LucideIcon;
  label: string;
  href: string;
}

export type DashboardNavigationSection =
  | "overview"
  | "history"
  | "questions"
  | "analytics"
  | "settings";

export type DashboardActiveSection =
  | DashboardNavigationSection
  | "new-interview"
  | null;

export const DASHBOARD_NAVIGATION_ITEMS: readonly DashboardNavigationItem[] = [
  {
    id: "overview",
    icon: Monitor,
    label: "Overview",
    href: "/dashboard",
  },
  {
    id: "history",
    icon: History,
    label: "Interview History",
    href: "/dashboard/history",
  },
  {
    id: "questions",
    icon: BookOpen,
    label: "Question Bank",
    href: "/dashboard/questions",
  },
  {
    id: "analytics",
    icon: BarChart3,
    label: "Analytics",
    href: "/dashboard/analytics",
  },
  {
    id: "settings",
    icon: Settings,
    label: "Settings",
    href: "/dashboard/settings",
  },
];

export function getDashboardActiveSectionFromPath(
  path: string
): DashboardActiveSection {
  if (path === "/dashboard" || path === "/dashboard/") return "overview";
  if (path.startsWith("/dashboard/new-interview")) return "new-interview";
  if (path.startsWith("/dashboard/history")) return "history";
  if (path.startsWith("/dashboard/questions")) return "questions";
  if (path.startsWith("/dashboard/analytics")) return "analytics";
  if (path.startsWith("/dashboard/settings")) return "settings";
  return null;
}
