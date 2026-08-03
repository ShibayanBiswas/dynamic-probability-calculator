"use client";

import { type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Brain,
  Calculator,
  Cpu,
  LineChart,
  Package,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { DeskFooter } from "@/components/layout/desk-footer";
import { SiteNav } from "@/components/layout/site-nav";
import { PageEnter } from "@/components/ui/page-motion";
import { useTheme } from "@/lib/context/theme-provider";
import type { InfoBlurb } from "@/lib/info-blurb";
import { deskEase, softPulse, valuePop } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function AppPage({
  children,
  actions,
  dense,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  dense?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-mesh font-serif">
      <div className="desk-ambient-orbs" aria-hidden>
        <span className="desk-ambient-orb desk-ambient-orb--gold" />
        <span className="desk-ambient-orb desk-ambient-orb--maroon" />
      </div>
      <header className="brand-header sticky top-0 z-50 font-ui">
        <div className="brand-header-glow" />
        <div className="relative mx-auto flex max-w-full items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <BrandLogo />
            <div className="min-w-0 border-l border-[color:var(--ar-border)] pl-4">
              <h1 className="brand-title">Dynamic Probability Calculator</h1>
            </div>
          </div>
          {actions}
        </div>
        <SiteNav />
      </header>
      <main
        className={cn("relative z-10 mx-auto w-full max-w-full flex-1 px-4 lg:px-6", dense ? "py-3" : "py-5")}
      >
        <PageEnter>{children}</PageEnter>
      </main>
      <DeskFooter />
    </div>
  );
}

export function Panel({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: "cyan" | "purple";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(
        "glass desk-panel-live w-full rounded-xl border p-4",
        "border-[color:var(--ar-border)]",
        glow === "cyan" && "glass-glow-cyan",
        glow === "purple" && "glass-glow-purple",
        className,
      )}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, ease: deskEase }}
      whileHover={reduce ? undefined : { y: -2 }}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <h2 className="font-ui flex items-center gap-2 text-lg font-bold tracking-tight text-ink">
      {Icon ? (
        <motion.span
          className="inline-flex"
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
        >
          <Icon className="h-5 w-5 text-gold" />
        </motion.span>
      ) : null}
      {children}
    </h2>
  );
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-gold-dark">{children}</p>;
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

/** One parameter per full-width horizontal row (label left, control right). */
export function FieldStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

/** Section descriptions are intentionally disabled across the app. */
export function SectionInfo(props: { title?: string; body: string }) {
  void props;
  return null;
}

/** In-page subpage navigation (horizontal pill tabs). */
export function SubPageTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-stone-100 p-1.5 dark:border-[color:var(--ar-border)] dark:bg-[color:var(--ar-panel)]">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            className={cn(
              "relative flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
              isActive
                ? "text-maroon dark:text-[#a89860]"
                : "text-stone-600 hover:bg-white hover:text-ink dark:text-stone-500 dark:hover:bg-[rgba(212,178,76,0.04)] dark:hover:text-stone-300",
            )}
            type="button"
            onClick={() => onSelect(tab.id)}
          >
            {isActive ? (
              <motion.span
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-gold/30 to-gold/10 shadow-sm dark:from-gold/6 dark:to-transparent dark:shadow-none"
                layoutId="subpage-tab-active"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function FieldRow({
  label,
  children,
  wide,
}: {
  label: ReactNode;
  hint?: InfoBlurb;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", wide ? "md:grid-cols-[260px_1fr]" : "md:grid-cols-[200px_1fr]")}>
      <div className="flex items-start gap-2 pt-2.5">
        <label className="label-chip">{label}</label>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function InputGlow(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("input-glow w-full rounded-2xl px-4 py-3 text-sm outline-none", props.className)} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <InputGlow {...props} />;
}

export function SelectGlow(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "input-glow w-full cursor-pointer appearance-none rounded-2xl px-4 py-3 text-sm outline-none",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <SelectGlow {...props} />;
}

export function OutputGlow({
  children,
  className,
  accent = "cyan",
}: {
  children: ReactNode;
  className?: string;
  accent?: "cyan" | "purple" | "green";
}) {
  const reduce = useReducedMotion();
  const key = typeof children === "string" || typeof children === "number" ? String(children) : undefined;
  return (
    <motion.div
      className={cn(
        "rounded-2xl px-4 py-3 text-sm font-bold break-words [overflow-wrap:anywhere]",
        accent === "cyan" && "output-glow-cyan",
        accent === "purple" && "output-glow-purple",
        accent === "green" && "output-glow-green",
        className,
      )}
      {...(reduce ? {} : softPulse)}
    >
      <AnimatePresence mode="wait">
        <motion.span key={key ?? "static"} className="block" {...(reduce ? {} : valuePop)}>
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

export function Output({ children, className }: { children: ReactNode; className?: string }) {
  return <OutputGlow className={className}>{children}</OutputGlow>;
}

export function Button({
  variant = "ghost",
  active,
  children,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "accent" | "pill";
  active?: boolean;
}) {
  return (
    <button
      {...props}
      className={cn(
        "btn-animated btn-motion",
        variant === "primary" && "btn-primary",
        variant === "accent" && "btn-accent",
        variant === "ghost" && "btn-ghost",
        variant === "pill" && (active ? "btn-pill btn-pill-active" : "btn-pill"),
        props.disabled && "pointer-events-none opacity-40",
        className,
      )}
      type={type}
    >
      <span className="btn-shine" aria-hidden />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}

export function DataTable({
  children,
  className,
  scrollClassName = "max-h-[min(72vh,780px)] overflow-auto",
  tableClassName,
}: {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  tableClassName?: string;
}) {
  return (
    <div className={cn("data-table-premium-wrap", scrollClassName, className)}>
      <table className={cn("data-table-premium min-w-full text-sm", tableClassName)}>{children}</table>
    </div>
  );
}

const kpiIcons: Record<string, LucideIcon> = {
  "Mark Level": Wallet,
  "Book Amount ₹ Cr": Wallet,
  "Initial Prob": Calculator,
  "Current Prob": Calculator,
  Probability: Calculator,
  "Paths Included": Package,
  Successes: Package,
  "Success Threshold": Calculator,
  "Target Percent": Calculator,
  "Percent Required": Calculator,
  "Days Left to Last Observation": LineChart,
  "Latest Index Date": LineChart,
  Ongoing: LineChart,
  "Path Performance": BarChart3,
  "Full Coupon": Calculator,
  "Avg Full Coupon": Calculator,
  AUM: Wallet,
  "Total Amount": Wallet,
  "Live Notional": Wallet,
  Products: Package,
  "Avg Coupon": Calculator,
  "Expiring in 3M": LineChart,
  "Expiring in 1M": LineChart,
  "Observation Due in 3M": LineChart,
  "Observation Due in 2M": LineChart,
  "Observation Due in 1M": LineChart,
  Active: LineChart,
  "Logic Modules": Brain,
  "Pipeline Stages": Cpu,
  Primitives: Zap,
  Listed: Package,
};

function resolveKpiIcon(label: string): LucideIcon {
  if (kpiIcons[label]) return kpiIcons[label]!;
  if (/Prob/i.test(label)) return Calculator;
  if (/^Value\b|^Mark\b|^AUM\b|^Book Amount/i.test(label)) return Wallet;
  if (/Coupon/i.test(label)) return Calculator;
  if (/Days|Expiry|Observation|Tenor/i.test(label)) return LineChart;
  return Calculator;
}

export function KpiBand({
  items,
  accents = ["cyan", "purple", "green"],
}: {
  items: Array<{ label: string; value: string }>;
  accents?: Array<"cyan" | "purple" | "green" | "amber" | "rose">;
}) {
  const { theme } = useTheme();
  const colors =
    theme === "dark"
      ? { cyan: "#c9a040", purple: "#b8956a", green: "#4ade80", amber: "#d4b24c", rose: "#a8821f" }
      : { cyan: "#a8821f", purple: "#7a1e2c", green: "#15803d", amber: "#b45309", rose: "#be123c" };
  const count = items.length;
  const denseColumns = count >= 8 ? 4 : count >= 5 ? Math.min(count, 5) : undefined;

  return (
    <div
      className={cn(
        "kpi-band-grid kpi-band-fill w-full gap-3 md:gap-4",
        count >= 5 && "kpi-band-dense",
        count >= 8 && "kpi-band-wide",
      )}
      style={
        denseColumns
          ? ({ gridTemplateColumns: `repeat(${denseColumns}, minmax(0, 1fr))` } as React.CSSProperties)
          : undefined
      }
    >
      {items.map((item, index) => {
        const accent = accents[index % accents.length] ?? "cyan";
        const Icon = resolveKpiIcon(item.label);
        return (
          <motion.div
            key={item.label}
            animate={{ opacity: 1, y: 0 }}
            className={cn("kpi-card kpi-card-fill kpi-card-live min-w-0", count >= 5 && "kpi-card-dense")}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            style={{ "--kpi-accent": colors[accent] } as React.CSSProperties}
            transition={{ delay: index * 0.07, duration: 0.45, ease: deskEase }}
            whileHover={{ scale: 1.035, y: -3 }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="kpi-card-label flex-1">{item.label}</p>
              <motion.div
                className="shrink-0 rounded-xl p-1.5 md:p-2"
                style={{ backgroundColor: `${colors[accent]}20`, color: colors[accent] }}
                animate={{ rotate: [0, -8, 8, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 }}
              >
                <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </motion.div>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={item.value}
                className="kpi-card-value mt-2 md:mt-3"
                initial={{ opacity: 0.4, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
              >
                {item.value}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

export function ChartPanel({
  title,
  subtitle,
  children,
  glow,
  icon,
  className,
  badge = "Live chart",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  glow?: "cyan" | "purple";
  icon?: "chart";
  className?: string;
  badge?: string;
}) {
  return (
    <Panel glow={glow} className={className}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionTitle icon={icon === "chart" ? BarChart3 : undefined}>{title.toUpperCase()}</SectionTitle>
          {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-gold-dark">
          {badge}
        </span>
      </div>
      <div className="chart-panel-body mt-5">{children}</div>
    </Panel>
  );
}
