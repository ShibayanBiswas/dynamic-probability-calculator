"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/layout/app-ui";
import { useDataset } from "@/lib/context/dataset-provider";
import { cn } from "@/lib/utils";

type MasterUploadButtonProps = {
  className?: string;
  label?: string;
  loadingLabel?: string;
  variant?: "primary" | "accent" | "ghost";
  /** Hide label text below `sm` breakpoint — icon + aria-label remain. */
  compactOnMobile?: boolean;
};

export function MasterUploadButton({
  className,
  label = "Upload Master Workbook",
  loadingLabel = "Uploading…",
  variant = "primary",
  compactOnMobile = false,
}: MasterUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isLoading, uploadWorkbook } = useDataset();
  const displayLabel = isLoading ? loadingLabel : label;

  return (
    <>
      <Button
        aria-label={displayLabel}
        className={cn(className)}
        disabled={isLoading}
        type="button"
        variant={variant}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4 shrink-0" />
        <span className={cn(compactOnMobile && "hidden sm:inline")}>{displayLabel}</span>
      </Button>
      <input
        ref={inputRef}
        accept=".xlsx,.xlsm"
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadWorkbook(file);
          event.target.value = "";
        }}
      />
    </>
  );
}
