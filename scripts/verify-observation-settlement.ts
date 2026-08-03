/**
 * Guard 0D observation settlement: blank before NSE cash close, fill after EOD.
 */
import assert from "node:assert/strict";

import {
  isAfterNseCashClose,
  isObservationFixingSettled,
} from "../lib/observation-settlement";

function main() {
  const obsToday = new Date(2026, 6, 30); // local calendar 30-Jul-2026
  const preClose = new Date("2026-07-30T10:00:00+05:30");
  const atClose = new Date("2026-07-30T15:30:00+05:30");
  const postClose = new Date("2026-07-30T16:05:00+05:30");
  const past = new Date(2026, 6, 28);
  const future = new Date(2026, 7, 25);

  assert.equal(isAfterNseCashClose(preClose), false);
  assert.equal(isAfterNseCashClose(atClose), true);
  assert.equal(isAfterNseCashClose(postClose), true);

  assert.equal(isObservationFixingSettled(obsToday, preClose), false, "0D pre-EOD must stay blank");
  assert.equal(isObservationFixingSettled(obsToday, atClose), true, "0D at EOD may fill");
  assert.equal(isObservationFixingSettled(obsToday, postClose), true, "0D post-EOD may fill");
  assert.equal(isObservationFixingSettled(past, preClose), true, "past obs fills anytime");
  assert.equal(isObservationFixingSettled(future, postClose), false, "future obs stays blank");

  console.log("verify-observation-settlement: PASS");
}

main();
