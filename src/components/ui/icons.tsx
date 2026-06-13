import {
  LayoutDashboard, Briefcase, Factory, Wrench, TriangleAlert,
  Wallet, Users, Settings, Search, Plus, X, LogOut, Bell, Menu,
  Lock, Download, ChevronRight, Clock, Check, ShieldCheck,
  PencilRuler, ClipboardList, CalendarDays, Trash2,
  Package, ExternalLink, PackageCheck, FileText,
  FileCheck, FilePlus, Banknote,
  type LucideIcon,
} from "lucide-react";

export const NavIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard, jobs: Briefcase, production: Factory,
  prodqueue: CalendarDays,
  designer: PencilRuler, boq: ClipboardList,
  installation: Wrench, issues: TriangleAlert, finance: Wallet,
  users: Users, settings: Settings,
};

export {
  Search, Plus, X, LogOut, Bell, Menu, Lock, Download,
  ChevronRight, Clock, Check, ShieldCheck, TriangleAlert,
  CalendarDays, Trash2, Package, ExternalLink, PackageCheck,
  ClipboardList, FileText, FileCheck, FilePlus, Banknote,
};
