/** Readable desk labels for Primary master sheet column headers. */
const MASTER_COLUMN_LABELS: Record<string, string> = {
  Month: "Issue Month",
  "Rollover Phase": "Rollover Phase",
  "Rollover C/P Date": "Rollover Date",
  "Name on Signup Form": "Product Name",
  Series: "Product Series",
  "ISIN No.": "ISIN Number",
  Issuer: "Issuer Name",
  Underlying: "Underlying Index",
  "Trade Date/Opening date": "Trade Date",
  "Allotment Date": "Allotment Date",
  "Actual Entry Level": "Initial Entry Level",
  "Target Nifty": "Target Level",
  "Observation Months": "Observation Months",
  "Avg. 2": "Observation Average 2",
  "Avg. 3": "Observation Average 3",
  "Avg. 4": "Observation Average 4",
  "Avg. 5": "Observation Average 5",
  "Avg. 6": "Observation Average 6",
  "Avg. 7": "Observation Average 7",
  "Average 1": "Observation Average 1",
  "Last Observation Date": "Last Observation Date",
  Maturity: "Maturity Date",
  Tenor: "Tenor Days",
  "Trade Amount": "Trade Amount in Rupees",
  "price per debenture": "Price per Debenture in Rupees",
  "Coupon (%)": "Coupon Percentage",
  "Coupon / PR / DM": "Coupon · PR · DM",
  Formulae: "Payoff Formula",
  "Product Explanation": "Product Description",
  "Principal Protection": "Capital Protection",
  Listing: "Listed or Unlisted",
  "Product Type": "Structure Type",
  "Classification based on tenor": "Tenor Classification",
  "Arranger Fees (%)": "Arranger Fees Percentage",
  "Arranger Fees (Rs.)": "Arranger Fees Amount",
  "Upfront fees (%)": "Upfront Fees Percentage",
  "Upfront fees (Rs.)": "Upfront Fees Amount",
  POED: "POED",
  Category: "Product Category",
  Name: "Product Name",
};

/** Expand abbreviated master headers into full desk-readable labels. */
export function formatMasterColumnLabel(key: string, occurrence = 0): string {
  const trimmed = key.trim();
  if (!trimmed) return key;

  if (trimmed === "Trade Date/Opening date") {
    return occurrence === 0 ? "Trade Date" : "Trade Date Duplicate";
  }

  if (trimmed === "Month" && occurrence > 0) {
    return "Issue Month Duplicate";
  }

  if (MASTER_COLUMN_LABELS[trimmed]) return MASTER_COLUMN_LABELS[trimmed];

  return trimmed
    .replace(/\bISIN\b/gi, "ISIN")
    .replace(/\bPP\b/g, "Principal Protected")
    .replace(/\bNPP\b/gi, "Non Principal Protected")
    .replace(/\bPR\b/g, "Participation Return")
    .replace(/\bDM\b/g, "Digital Multiplier")
    .replace(/\bRs\.\b/g, "Rupees")
    .replace(/\bAvg\.\b/g, "Average")
    .replace(/\bC\/P\b/g, "Call Put")
    .replace(/\(%\)/g, " Percentage")
    .replace(/\(Rs\.\)/gi, " Amount")
    .replace(/\(Rupees\)/gi, " in Rupees")
    .replace(/\//g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove desk export suffix before parsing product names from NEW PRIMARY. */
export function stripRolloverPhaseNameSuffix(name: string): string {
  return name.replace(/\s*\(ROLLOVER PHASE [12]\)\s*$/i, "").trim();
}
