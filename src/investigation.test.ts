import { describe, expect, it } from "vitest";
import { advanceCustody, createInitialState, dispatch } from "./game";
import type { GameState } from "./game";
import {
  INVESTIGATION_ACTIONS,
  investigationObjective,
  nextInvestigationStep,
  siteAccessReason,
} from "./investigation";
import type { InvestigationStep } from "./investigation";

const ROUTE: readonly InvestigationStep[] = [
  "accept-lead",
  "claim-tokens",
  "breach-villa",
  "copy-directives",
  "breach-residence",
  "copy-manifest",
  "breach-depths",
  "copy-register",
  "hear-survivor",
  "copy-routing",
  "open-refuge",
  "broadcast",
];

function investigate(state: GameState, step: InvestigationStep) {
  return dispatch(state, {
    type: "investigate",
    step,
    at: INVESTIGATION_ACTIONS[step].at,
  });
}

function trusted() {
  const state = createInitialState();
  dispatch(state, { type: "begin" });
  expect(dispatch(state, { type: "accept-job", jobId: "pump-audit" }).ok).toBe(
    true,
  );
  expect(dispatch(state, { type: "interact", at: "pump" }).ok).toBe(true);
  return state;
}

function through(state: GameState, last: InvestigationStep) {
  const next = nextInvestigationStep(state);
  expect(next).toBeDefined();
  for (const step of ROUTE.slice(ROUTE.indexOf(next!), ROUTE.indexOf(last) + 1))
    expect(investigate(state, step).ok).toBe(true);
}

function rejectedUnchanged(state: GameState, step: InvestigationStep) {
  const before = structuredClone(state);
  expect(investigate(state, step).ok).toBe(false);
  expect(state).toEqual(before);
}

describe("Under the Compact investigation", () => {
  it("requires a playing shift and earned trust, and cannot mutate through a wrong location or step", () => {
    const state = createInitialState();
    rejectedUnchanged(state, "accept-lead");
    dispatch(state, { type: "begin" });
    rejectedUnchanged(state, "accept-lead");
    rejectedUnchanged(state, "claim-tokens");
    expect(
      dispatch(state, { type: "track-investigation", tracking: true }).ok,
    ).toBe(false);
    expect(investigationObjective(state)).toBeUndefined();

    const ready = trusted();
    const before = structuredClone(ready);
    expect(
      dispatch(ready, {
        type: "investigate",
        step: "accept-lead",
        at: "token-broker",
      }).ok,
    ).toBe(false);
    expect(ready).toEqual(before);
    through(ready, "claim-tokens");
    rejectedUnchanged(ready, "breach-residence");
    rejectedUnchanged(ready, "copy-directives");
    const funded = structuredClone(ready);
    expect(
      dispatch(ready, {
        type: "investigate",
        step: "breach-villa",
        at: "residence-entry",
      }).ok,
    ).toBe(false);
    expect(ready).toEqual(funded);
  });

  it("spends exactly three one-time tokens on three persistent locks without credit, hour or ledger changes", () => {
    const state = trusted();
    const financial = {
      credits: state.credits,
      hours: state.hours,
      ledger: structuredClone(state.ledger),
    };
    through(state, "claim-tokens");
    expect(state.investigation.tokens).toBe(3);
    rejectedUnchanged(state, "claim-tokens");
    through(state, "breach-villa");
    expect(state.investigation.tokens).toBe(2);
    expect(siteAccessReason(state.investigation, "villa")).toBe("");
    rejectedUnchanged(state, "breach-villa");
    rejectedUnchanged(state, "claim-tokens");
    through(state, "breach-residence");
    expect(state.investigation.tokens).toBe(1);
    expect(siteAccessReason(state.investigation, "residence")).toBe("");
    rejectedUnchanged(state, "breach-residence");
    through(state, "breach-depths");
    expect(state.investigation.tokens).toBe(0);
    expect(siteAccessReason(state.investigation, "detention")).toBe("");
    rejectedUnchanged(state, "breach-depths");
    rejectedUnchanged(state, "claim-tokens");
    through(state, "broadcast");
    expect(state.investigation.unlocked).toEqual({
      villa: true,
      residence: true,
      bunker: true,
    });
    expect({
      credits: state.credits,
      hours: state.hours,
      ledger: state.ledger,
    }).toEqual(financial);
    for (const step of ROUTE) rejectedUnchanged(state, step);
  });

  it("requires witness consent and corroboration before deeper access, a complete archive before refuge, and refuge before broadcast", () => {
    const state = trusted();
    through(state, "breach-depths");
    expect(siteAccessReason(state.investigation, "routing")).not.toBe("");
    rejectedUnchanged(state, "hear-survivor");
    rejectedUnchanged(state, "copy-routing");
    rejectedUnchanged(state, "open-refuge");
    through(state, "copy-register");
    expect(siteAccessReason(state.investigation, "routing")).not.toBe("");
    rejectedUnchanged(state, "copy-routing");
    rejectedUnchanged(state, "broadcast");
    through(state, "hear-survivor");
    expect(siteAccessReason(state.investigation, "routing")).toBe("");
    rejectedUnchanged(state, "open-refuge");
    through(state, "copy-routing");
    expect(state.investigation.evidence).toEqual([
      "directives",
      "manifest",
      "registry",
      "testimony",
      "routing",
    ]);
    rejectedUnchanged(state, "broadcast");
    through(state, "open-refuge");
    const sheltered = structuredClone(state);
    expect(
      dispatch(state, {
        type: "investigate",
        step: "broadcast",
        at: "refuge-control",
      }).ok,
    ).toBe(false);
    expect(state).toEqual(sheltered);
    through(state, "broadcast");
    expect(state.investigation.exposed).toBe(true);
    expect(nextInvestigationStep(state)).toBeUndefined();
    expect(investigationObjective(state)).toBeUndefined();
  });

  it("keeps collected records and progression when tracking is paused, and cannot resume tracking after completion", () => {
    const state = trusted();
    expect(investigationObjective(state)).toBeUndefined();
    through(state, "copy-directives");
    const records = [...state.investigation.evidence];
    expect(investigationObjective(state)).toBe("residence-entry");
    expect(
      dispatch(state, { type: "track-investigation", tracking: false }).ok,
    ).toBe(true);
    expect(investigationObjective(state)).toBeUndefined();
    expect(nextInvestigationStep(state)).toBe("breach-residence");
    expect(state.investigation.evidence).toEqual(records);
    expect(
      dispatch(state, { type: "track-investigation", tracking: true }).ok,
    ).toBe(true);
    expect(investigationObjective(state)).toBe("residence-entry");
    through(state, "broadcast");
    const complete = structuredClone(state);
    expect(
      dispatch(state, { type: "track-investigation", tracking: true }).ok,
    ).toBe(false);
    expect(state).toEqual(complete);
    expect(state.investigation.evidence).toEqual([
      "directives",
      "manifest",
      "registry",
      "testimony",
      "routing",
    ]);
  });

  it("blocks story actions in custody but resumes offline tokens after release with the issuer key still frozen", () => {
    const state = trusted();
    through(state, "breach-villa");
    expect(
      dispatch(state, {
        type: "accept-job",
        jobId: "offgrid-relay",
        at: "underground-contact",
      }).ok,
    ).toBe(true);
    expect(dispatch(state, { type: "recognition-inspection" }).ok).toBe(true);
    rejectedUnchanged(state, "copy-directives");
    advanceCustody(state, 28);
    expect(dispatch(state, { type: "release-custody" }).ok).toBe(true);
    expect(state.keyFrozen).toBe(true);
    expect(state.citizenship).toBe("revoked");
    const financial = {
      credits: state.credits,
      hours: state.hours,
      ledger: structuredClone(state.ledger),
    };
    through(state, "broadcast");
    expect(state.investigation.exposed).toBe(true);
    expect(state.investigation.tokens).toBe(0);
    expect({
      credits: state.credits,
      hours: state.hours,
      ledger: state.ledger,
    }).toEqual(financial);
    expect(state.keyFrozen).toBe(true);
    expect(dispatch(state, { type: "settle" }).ok).toBe(true);
    expect(state.ending).toBe("denaturalized");
    expect(state.investigation.exposed).toBe(true);
    rejectedUnchanged(state, "claim-tokens");
  });

  it("leaves the full legal workday solvable and resets all access, evidence and trust with a fresh day", () => {
    const state = trusted();
    for (const jobId of ["stair-delivery", "meter-witness"] as const) {
      expect(dispatch(state, { type: "accept-job", jobId }).ok).toBe(true);
      if (jobId === "stair-delivery")
        expect(
          dispatch(state, { type: "interact", at: "parcel-depot" }).ok,
        ).toBe(true);
      expect(
        dispatch(state, {
          type: "interact",
          at: jobId === "stair-delivery" ? "delivery-landing" : "meter",
        }).ok,
      ).toBe(true);
    }
    expect(state.hours).toBe(0);
    through(state, "broadcast");
    expect(dispatch(state, { type: "buy-ration" }).ok).toBe(true);
    expect(dispatch(state, { type: "settle" }).ok).toBe(true);
    expect([state.ending, state.credits]).toEqual(["housed", 2]);

    const reset = createInitialState();
    expect(reset.investigation.evidence).toEqual([]);
    for (const site of [
      "market",
      "villa",
      "residence",
      "bunker",
      "detention",
      "routing",
    ] as const)
      expect(siteAccessReason(reset.investigation, site)).not.toBe("");
    dispatch(reset, { type: "begin" });
    rejectedUnchanged(reset, "accept-lead");
    rejectedUnchanged(reset, "claim-tokens");
    expect(state.investigation.exposed).toBe(true);
  });
});
