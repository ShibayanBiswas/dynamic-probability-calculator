import {
  BarChart3,
  Calculator,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import { PRODUCT_CATEGORIES } from "@/lib/types";

export type NavSectionId = "home" | "portfolio" | "desk" | "intel";

export type SubNavItem = {
  href: string;
  label: string;
  match?: (pathname: string) => boolean;
};

export type MainNavItem = {
  id: NavSectionId;
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  subNav?: SubNavItem[];
};

export const mainSections: MainNavItem[] = [
  {
    id: "home",
    href: "/",
    label: "Home",
    icon: LayoutDashboard,
    match: (p) => p === "/",
  },
  {
    id: "portfolio",
    href: "/portfolio/analytics",
    label: "Portfolio",
    icon: BarChart3,
    match: (p) => p.startsWith("/portfolio") || p.startsWith("/probability"),
    subNav: [
      { href: "/portfolio/analytics", label: "Analytics Lab", match: (p) => p.startsWith("/portfolio/analytics") },
      { href: "/probability", label: "Probability", match: (p) => p.startsWith("/probability") },
    ],
  },
  {
    id: "desk",
    href: "/desk",
    label: "Desk",
    icon: Calculator,
    match: (p) =>
      p.startsWith("/desk") ||
      p.startsWith("/initial-probability") ||
      p.startsWith("/current-probability"),
    subNav: [
      { href: "/desk", label: "Command", match: (p) => p === "/desk" },
      {
        href: "/initial-probability",
        label: "Initial Probability",
        match: (p) => p.startsWith("/initial-probability"),
      },
      {
        href: "/current-probability",
        label: "Current Probability",
        match: (p) => p.startsWith("/current-probability"),
      },
    ],
  },
  {
    id: "intel",
    href: "/intelligence",
    label: "Intel",
    icon: Sparkles,
    match: (p) => p.startsWith("/intelligence"),
    subNav: [{ href: "/intelligence", label: "Logic Atlas", match: (p) => p.startsWith("/intelligence") }],
  },
];

export const categoryQuickLinks = PRODUCT_CATEGORIES.map((category) => ({
  category,
}));

export function resolveNavSection(pathname: string): MainNavItem {
  return mainSections.find((s) => s.match(pathname)) ?? mainSections[0];
}

export const commandRoutes = [
  { href: "/", label: "Home", group: "Navigate" },
  { href: "/portfolio/analytics", label: "Analytics Lab", group: "Portfolio" },
  { href: "/probability", label: "Probability", group: "Portfolio" },
  { href: "/desk", label: "Desk Command", group: "Desk" },
  { href: "/initial-probability", label: "Initial Probability", group: "Desk" },
  { href: "/current-probability", label: "Current Probability", group: "Desk" },
  { href: "/intelligence", label: "Logic Atlas", group: "Intel" },
  { href: "/upload", label: "Upload Master", group: "Data" },
];
