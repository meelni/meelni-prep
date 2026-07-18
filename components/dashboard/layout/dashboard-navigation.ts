import {
  BarChart3,
  BookOpen,
  History,
  Monitor,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface DashboardNavigationItem {
  id: string;
  icon: LucideIcon;
  label: string;
  href: string;
}

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
