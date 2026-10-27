import {
  BarChart3, Bell, FileText, FolderKanban, Hammer, Landmark, LayoutDashboard, LineChart, Percent, Receipt,
  Settings, ShieldCheck, TrendingUp, UserCog, Users, Wallet, type LucideIcon,
} from "lucide-react";

export const NAV_ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, users: Users, "file-text": FileText, "folder-kanban": FolderKanban, landmark: Landmark,
  "trending-up": TrendingUp, receipt: Receipt, wallet: Wallet, hammer: Hammer, "line-chart": LineChart, percent: Percent,
  "user-cog": UserCog, "bar-chart-3": BarChart3, bell: Bell, settings: Settings, "shield-check": ShieldCheck,
};
