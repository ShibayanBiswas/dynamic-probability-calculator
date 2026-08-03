/**
 * Shared Framer Motion presets for the Primary SP desk.
 * Respects prefers-reduced-motion via useReducedMotion at call sites.
 */

export const deskEase = [0.22, 1, 0.36, 1] as const;

export const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: deskEase },
};

export const bandEnter = (delay = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, delay: Math.min(delay, 0.12), ease: deskEase },
});

export const staggerContainer = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8, scale: 0.99 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: deskEase },
  },
};

export const panelHover = {
  whileHover: { y: -3, transition: { duration: 0.22 } },
  whileTap: { scale: 0.995 },
};

export const softPulse = {
  animate: {
    boxShadow: [
      "0 0 0 0 rgba(212,178,76,0)",
      "0 0 22px 0 rgba(212,178,76,0.22)",
      "0 0 0 0 rgba(212,178,76,0)",
    ],
  },
  transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" as const },
};

export const fadeScale = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.28, ease: deskEase },
};

export const valuePop = {
  initial: { opacity: 0.55, y: 3 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: deskEase },
};
