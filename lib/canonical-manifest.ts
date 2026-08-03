import manifest from "@/lib/data/canonical-manifest.json";

export type CanonicalManifest = {
  generatedAt: string;
  workbookName: string;
  deskCanonicalProducts: number;
  deskCanonicalFormulas: number;
  liveNotionalCr: number;
  /** Desk-canonical deduped book (NEW PRIMARY → pickCanonicalRowsForDesk). */
  deskBookNotionalCr?: number;
  protectedCallIsin: string | null;
  explorerGrids: {
    primaryRows: number;
    rolloverRows: number;
    newPrimaryRows: number;
  };
  merge: {
    totalRows: number;
    primaryInputRows: number;
    rolloverInputRows: number;
    duplicatePhase2Removed: number;
    byPhase: {
      blank: number;
      tenyears: number;
      phase1: number;
      phase2: number;
      other: number;
    };
  };
};

export const CANONICAL_MANIFEST = manifest as CanonicalManifest;
