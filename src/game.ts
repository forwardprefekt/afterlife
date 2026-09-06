import { JOBS } from "./content";
import type { InteractionId, JobId } from "./content";
import {
  createInvestigationState,
  performInvestigation,
} from "./investigation";
import type { InvestigationState, InvestigationStep } from "./investigation";
import type { LandmarkId } from "./content";
export type { InteractionId, JobId } from "./content";

export type Ending =
  "housed" | "hungry" | "indebted" | "evicted" | "denaturalized";
export interface Transaction {
  id: number;
  description: string;
  amount: number;
  accepted: boolean;
  reason: string;
  balance: number;
}
export const CUSTODY_DURATIONS = {
  transport: 8,
  processing: 3,
  upload: 3,
  sentence: 6,
  reupload: 3,
  announcement: 5,
} as const;
export type CustodyPhase = keyof typeof CUSTODY_DURATIONS | "release";
const NEXT_CUSTODY_PHASE: Record<keyof typeof CUSTODY_DURATIONS, CustodyPhase> =
  {
    transport: "processing",
    processing: "upload",
    upload: "sentence",
    sentence: "reupload",
    reupload: "announcement",
    announcement: "release",
  };
export interface GameState {
  phase: "intro" | "playing" | "ended";
  credits: number;
  hours: number;
  rationConsumed: boolean;
  showerConsumed: boolean;
  custody: { phase: CustodyPhase; elapsed: number } | null;
  totalYearsServed: number;
  loan: number;
  loanTaken: boolean;
  keyFrozen: boolean;
  citizenship: "recognized" | "revoked";
  activeJob: { id: JobId; stage: "pickup" | "deliver" } | null;
  completedJobs: JobId[];
  exposureSeconds: number;
  ledger: Transaction[];
  ending: Ending | null;
  investigation: InvestigationState;
}
export type GameAction =
  | { type: "begin" }
  | { type: "accept-job"; jobId: JobId; at?: InteractionId }
  | { type: "abandon-job" }
  | { type: "interact"; at: InteractionId }
  | { type: "buy-ration" }
  | { type: "buy-shower" }
  | { type: "recognition-inspection" }
  | { type: "release-custody" }
  | { type: "borrow" }
  | { type: "settle" }
  | { type: "investigate"; step: InvestigationStep; at: LandmarkId }
  | { type: "track-investigation"; tracking: boolean };
export interface ActionResult {
  ok: boolean;
  message: string;
}

export function createInitialState(): GameState {
  return {
    phase: "intro",
    credits: 0,
    hours: 6,
    rationConsumed: false,
    showerConsumed: false,
    custody: null,
    totalYearsServed: 0,
    loan: 0,
    loanTaken: false,
    keyFrozen: false,
    citizenship: "recognized",
    activeJob: null,
    completedJobs: [],
    exposureSeconds: 0,
    ledger: [],
    ending: null,
    investigation: createInvestigationState(),
  };
}

// All money, including rejected transfers, passes through this issuer-controlled boundary.
function transact(
  state: GameState,
  amount: number,
  description: string,
  rejection = "",
): ActionResult {
  const reason = state.keyFrozen
    ? "Key frozen. The issuer has blocked all transfers."
    : rejection ||
      (state.credits + amount < 0
        ? "Insufficient credits. No funds transferred."
        : "Settled by Meridian issuer.");
  const accepted =
    !state.keyFrozen &&
    !rejection &&
    state.credits + amount >= 0 &&
    Number.isInteger(amount);
  if (accepted) state.credits += amount;
  state.ledger.push({
    id: state.ledger.length + 1,
    description,
    amount,
    accepted,
    reason,
    balance: state.credits,
  });
  return { ok: accepted, message: accepted ? description : reason };
}

export function jobDisabledReason(state: GameState, id: JobId): string {
  if (state.phase !== "playing") return "No active shift.";
  if (state.citizenship === "revoked" || state.keyFrozen)
    return "Access denied: recognition revoked and key frozen.";
  if (state.completedJobs.includes(id)) return "Completed this shift.";
  if (state.activeJob) return "Finish or abandon your active assignment first.";
  if (state.hours < JOBS[id].hours)
    return "Not enough work hours. Return home to settle.";
  if (
    id === "offgrid-relay" &&
    !state.completedJobs.some((job) => job !== "offgrid-relay")
  )
    return "Complete a legal job to earn Mara’s trust.";
  return "";
}

export function dispatch(state: GameState, action: GameAction): ActionResult {
  if (action.type === "begin") {
    if (state.phase !== "intro")
      return { ok: false, message: "This shift has already begun." };
    state.phase = "playing";
    return transact(state, 12, "Employer stipend");
  }
  if (state.phase !== "playing")
    return { ok: false, message: "There is no active shift." };
  if (action.type === "release-custody") {
    if (state.custody?.phase !== "release")
      return { ok: false, message: "The release gate is not authorized yet." };
    state.custody = null;
    return {
      ok: true,
      message:
        "Released to Meridian. Your key remains frozen. Your room is still reachable for settlement.",
    };
  }
  if (state.custody)
    return {
      ok: false,
      message: "Resident in custody. Wait for sentence processing and release.",
    };
  switch (action.type) {
    case "investigate":
      return performInvestigation(state, action.step, action.at);
    case "track-investigation":
      if (
        !state.investigation.accepted ||
        (action.tracking && state.investigation.exposed)
      )
        return {
          ok: false,
          message: "There is no unfinished investigation to track.",
        };
      state.investigation.tracking = action.tracking;
      return {
        ok: true,
        message: action.tracking
          ? "Tracking Under the Compact. Your work assignment is kept."
          : "Tracking the workday. Your investigation and access are kept.",
      };
    case "recognition-inspection":
      if (state.activeJob?.id !== "offgrid-relay")
        return {
          ok: true,
          message:
            "Inspection complete. No prohibited cargo. No fee or confiscation.",
        };
      arrest(state);
      return {
        ok: true,
        message:
          "Prohibited component detected. Custody transport dispatched. Ten-year consciousness sentence authorized.",
      };
    case "buy-shower": {
      const result = transact(
        state,
        -2,
        "Shared shower access",
        state.showerConsumed ? "Shower already used this shift." : "",
      );
      if (result.ok) state.showerConsumed = true;
      return result.ok
        ? {
            ok: true,
            message:
              "2 AC settled. Bay 06 is reserved. Step under its showerhead to start the water.",
          }
        : result;
    }
    case "accept-job": {
      const reason = jobDisabledReason(state, action.jobId);
      if (reason) return { ok: false, message: reason };
      if (
        action.jobId === "offgrid-relay" &&
        action.at !== "underground-contact"
      )
        return {
          ok: false,
          message:
            "Meet Mara on the west service route to collect the component.",
        };
      state.activeJob = {
        id: action.jobId,
        stage: action.jobId === "stair-delivery" ? "pickup" : "deliver",
      };
      state.exposureSeconds = 0;
      return { ok: true, message: `${JOBS[action.jobId].name} accepted.` };
    }
    case "abandon-job": {
      if (!state.activeJob)
        return { ok: false, message: "No assignment to abandon." };
      state.activeJob = null;
      state.exposureSeconds = 0;
      return {
        ok: true,
        message:
          "Assignment abandoned. Carried items returned. No pay or time charge.",
      };
    }
    case "interact": {
      if (action.at === "border-terminal" && state.citizenship === "revoked")
        return {
          ok: false,
          message:
            "Transit denied. Citizenship revoked; record shared with participating compacts.",
        };
      if (state.keyFrozen)
        return {
          ok: false,
          message:
            "Inspection permitted. Work and payment access denied: key frozen.",
        };
      const active = state.activeJob;
      if (!active)
        return { ok: true, message: "No assigned work at this location." };
      if (
        active.id === "stair-delivery" &&
        active.stage === "pickup" &&
        action.at === "parcel-depot"
      ) {
        active.stage = "deliver";
        return {
          ok: true,
          message:
            "Parcel collected. Take the exterior stair north to the upper landing.",
        };
      }
      const job = JOBS[active.id];
      if (active.stage !== "deliver" || job.destination !== action.at)
        return {
          ok: false,
          message: "Your active assignment requires a different destination.",
        };
      if (state.completedJobs.includes(active.id) || state.hours < job.hours)
        return {
          ok: false,
          message:
            "This assignment cannot be paid again or exceed remaining hours.",
        };
      const result = transact(state, job.reward, `${job.name} payment`);
      if (!result.ok) return result;
      state.hours -= job.hours;
      state.completedJobs.push(active.id);
      state.activeJob = null;
      state.exposureSeconds = 0;
      return {
        ok: true,
        message: `${job.name} complete. +${job.reward} credits · ${job.hours} work hours used.${state.hours === 0 ? " Shift allocation exhausted. Return home." : ""}`,
      };
    }
    case "buy-ration": {
      const result = transact(
        state,
        -6,
        "Daily ration",
        state.rationConsumed ? "Daily ration already consumed." : "",
      );
      if (result.ok) state.rationConsumed = true;
      return result.ok
        ? { ok: true, message: "Ration consumed. A warm meal, for today." }
        : result;
    }
    case "borrow": {
      const result = transact(
        state,
        10,
        "Credit advance",
        state.loanTaken ? "Only one advance is permitted per day." : "",
      );
      if (result.ok) {
        state.loan = 12;
        state.loanTaken = true;
      }
      return result.ok
        ? {
            ok: true,
            message:
              "10 credits received. Repay 12 after housing at settlement.",
          }
        : result;
    }
    case "settle": {
      state.activeJob = null;
      state.exposureSeconds = 0;
      if (state.citizenship === "revoked" || state.keyFrozen)
        state.ending = "denaturalized";
      else if (!transact(state, -40, "Housing license").ok)
        state.ending = "evicted";
      else if (
        state.loan &&
        !transact(state, -state.loan, "Credit advance repayment").ok
      )
        state.ending = "indebted";
      else {
        state.loan = 0;
        state.ending = state.rationConsumed ? "housed" : "hungry";
      }
      state.phase = "ended";
      return { ok: true, message: `Shift ended: ${state.ending}.` };
    }
  }
}

export function advanceSurveillance(
  state: GameState,
  seconds: number,
  exposed: boolean,
): void {
  if (state.phase !== "playing" || state.keyFrozen) return;
  if (state.activeJob?.id !== "offgrid-relay" || !exposed) {
    state.exposureSeconds = 0;
    return;
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  state.exposureSeconds += seconds;
  if (state.exposureSeconds + 1e-9 < 2) return;
  arrest(state);
}

function arrest(state: GameState): void {
  if (state.custody || state.activeJob?.id !== "offgrid-relay") return;
  state.custody = { phase: "transport", elapsed: 0 };
  state.keyFrozen = true;
  state.citizenship = "revoked";
  state.hours -= JOBS["offgrid-relay"].hours;
  state.activeJob = null;
  state.exposureSeconds = 0;
  state.ledger.push({
    id: state.ledger.length + 1,
    description: "Surveillance enforcement",
    amount: 0,
    accepted: false,
    reason:
      "Unregistered component detected. Key frozen; citizenship revoked. Assignment failed; two work hours consumed. Custody: ten-year consciousness sentence.",
    balance: state.credits,
  });
}

/** Real, unpaused time drives custody; the sentence itself remains offscreen. */
export function advanceCustody(state: GameState, seconds: number): void {
  if (
    state.phase !== "playing" ||
    !state.custody ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  )
    return;
  let remaining = seconds;
  while (state.custody.phase !== "release") {
    const phase = state.custody.phase;
    const custody = state.custody;
    const duration = CUSTODY_DURATIONS[phase];
    const step = Math.min(remaining, duration - custody.elapsed);
    custody.elapsed += step;
    remaining -= step;
    if (custody.elapsed + 1e-9 < duration) break;
    if (custody.phase === "sentence") state.totalYearsServed += 10;
    custody.phase = NEXT_CUSTODY_PHASE[phase];
    custody.elapsed = 0;
    if (remaining <= 0) break;
  }
}
