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
};

export function MasterUploadButton({
  className,
  label = "Upload Master Workbook",
  loadingLabel = "Uploading…",
  variant = "primary",
}: MasterUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { isLoading, uploadWorkbook } = useDataset();

  return (
    <>
      <Button
        className={cn(className)}
        disabled={isLoading}
        type="button"
        variant={variant}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {isLoading ? loadingLabel : label}
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
