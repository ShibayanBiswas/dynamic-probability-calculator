import type { Metadata, Viewport } from "next";

import { DatasetProvider } from "@/lib/context/dataset-provider";
import { DeskDialogProvider } from "@/lib/context/desk-dialog-provider";
import { LifecycleIndexProvider } from "@/lib/context/lifecycle-index-provider";
import { ProductSelectionProvider } from "@/lib/context/product-selection-provider";
import { ThemeProvider } from "@/lib/context/theme-provider";

import "./globals.css";

const themeInitScript = `(function(){try{var t=localStorage.getItem("sp-dashboard-theme");if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}else{document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Dynamic Probability Calculator | Anand Rathi Wealth",
  description:
    "Anand Rathi Wealth structured products desk — dynamic probability, initial probability, and current probability analytics for the live Primary book.",
  icons: { icon: "/brand/arwl-logo.svg" },
};

/** Ensure the desk lays out correctly on phones and small tablets. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#12100c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="font-serif bg-background text-ink antialiased"
        style={{ fontFamily: "var(--font-serif), 'Times New Roman', Times, Georgia, serif" }}
      >
        <ThemeProvider>
          <DeskDialogProvider>
            <DatasetProvider>
              <LifecycleIndexProvider>
                <ProductSelectionProvider>{children}</ProductSelectionProvider>
              </LifecycleIndexProvider>
            </DatasetProvider>
          </DeskDialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}