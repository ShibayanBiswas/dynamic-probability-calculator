"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { useTheme } from "@/lib/context/theme-provider";

const LOGO_LIGHT = "/brand/arwl-logo.png";
const LOGO_DARK = "/brand/arwl-logo-white.png";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const { theme, mounted } = useTheme();
  const src = mounted && theme === "dark" ? LOGO_DARK : LOGO_LIGHT;
  const reduce = useReducedMotion();

  return (
    <Link
      aria-label="Anand Rathi Wealth — Dynamic Probability Calculator home"
      className="brand-logo-link shrink-0"
      href="/"
    >
      <motion.span
        className="inline-block"
        whileHover={reduce ? undefined : { scale: 1.04 }}
        transition={{ type: "spring", stiffness: 380, damping: 20 }}
      >
        <Image
          alt="Anand Rathi — Private Wealth. uncomplicated."
          className={
            compact
              ? "h-7 w-auto sm:h-8"
              : "h-8 w-auto max-w-[42vw] object-contain object-left sm:h-11 sm:max-w-none"
          }
          height={290}
          priority
          src={src}
          width={1280}
        />
      </motion.span>
    </Link>
  );
}
