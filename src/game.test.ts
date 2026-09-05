import { describe, expect, it } from "vitest";
import {
  advanceCustody,
  advanceSurveillance,
  createInitialState,
  dispatch,
} from "./game";
import type { GameState, JobId } from "./game";
import { insideScanner, JOBS } from "./content";

function begin() {
  const state = createInitialState();
  dispatch(state, { type: "begin" });
  return state;
}
function finish(state: GameState, jobId: JobId) {
  expect(
    dispatch(state, { type: "accept-job", jobId, at: "underground-contact" })
      .ok,
  ).toBe(true);
  if (jobId === "stair-delivery")
    dispatch(state, { type: "interact", at: "parcel-depot" });
  expect(
    dispatch(state, { type: "interact", at: JOBS[jobId].destination }).ok,
  ).toBe(true);
}
function legalDay() {
  const state = begin();
  for (const id of ["stair-delivery", "pump-audit", "meter-witness"] as const)
    finish(state, id);
  return state;
}

describe("issuer-controlled workday", () => {
  it("issues the stipend once and rejects mutations outside an active day", () => {
    const s = createInitialState();
    expect(dispatch(s, { type: "borrow" }).ok).toBe(false);
    advanceSurveillance(s, 3, true);
    expect(s.credits).toBe(0);
    dispatch(s, { type: "begin" });
    dispatch(s, { type: "begin" });
    expect(s.credits).toBe(12);
    dispatch(s, { type: "settle" });
    expect(dispatch(s, { type: "buy-ration" }).ok).toBe(false);
    expect(s.credits).toBe(12);
  });
  it("supports a full legal day, pays once, and exhausts all six hours", () => {
    const s = legalDay();
    expect(s.hours).toBe(0);
    const balance = s.credits;
    dispatch(s, { type: "interact", at: "meter" });
    expect(s.credits).toBe(balance);
    expect(
      dispatch(s, {
        type: "accept-job",
        jobId: "offgrid-relay",
        at: "underground-contact",
      }).ok,
    ).toBe(false);
    dispatch(s, { type: "buy-ration" });
    dispatch(s, { type: "settle" });
    expect([
      s.ending,
      s.credits,
      s.loan,
      s.rationConsumed,
      s.completedJobs.length,
    ]).toEqual(["housed", 2, 0, true, 3]);
  });
  it("cannot deliver without pickup, pays only at the assigned stop, and permits abandonment", () => {
    const s = begin();
    dispatch(s, { type: "accept-job", jobId: "stair-delivery" });
    expect(dispatch(s, { type: "interact", at: "delivery-landing" }).ok).toBe(
      false,
    );
    expect(dispatch(s, { type: "accept-job", jobId: "pump-audit" }).ok).toBe(
      false,
    );
    dispatch(s, { type: "interact", at: "parcel-depot" });
    dispatch(s, { type: "abandon-job" });
    expect([s.hours, s.credits, s.activeJob]).toEqual([6, 12, null]);
    finish(s, "stair-delivery");
    expect(
      dispatch(s, { type: "accept-job", jobId: "stair-delivery" }).ok,
    ).toBe(false);
    expect(s.credits).toBe(22);
  });
  it("rejects overspending and duplicate ration or loan without partial mutations", () => {
    const s = begin();
    dispatch(s, { type: "buy-ration" });
    expect(dispatch(s, { type: "buy-ration" }).ok).toBe(false);
    expect(s.credits).toBe(6);
    dispatch(s, { type: "borrow" });
    expect(dispatch(s, { type: "borrow" }).ok).toBe(false);
    expect([s.credits, s.loan]).toEqual([16, 12]);
    dispatch(s, { type: "settle" });
    expect([s.ending, s.credits, s.loan]).toEqual(["evicted", 16, 12]);
    expect(s.ledger.at(-1)?.accepted).toBe(false);
  });
  it("settles housing before debt without partial debt payments", () => {
    const s = begin();
    dispatch(s, { type: "borrow" });
    finish(s, "pump-audit");
    finish(s, "meter-witness");
    dispatch(s, { type: "buy-ration" });
    dispatch(s, { type: "settle" });
    expect([s.ending, s.credits, s.loan]).toEqual(["indebted", 2, 12]);
    expect(s.ledger.at(-2)?.amount).toBe(-40);
    expect(s.ledger.at(-1)?.accepted).toBe(false);
    const complete = legalDay();
    dispatch(complete, { type: "borrow" });
    dispatch(complete, { type: "buy-ration" });
    dispatch(complete, { type: "settle" });
    expect([complete.ending, complete.credits, complete.loan]).toEqual([
      "housed",
      0,
      0,
    ]);
  });
  it("distinguishes a room without a meal from eviction", () => {
    const s = legalDay();
    dispatch(s, { type: "settle" });
    expect([s.ending, s.credits]).toEqual(["hungry", 8]);
    const fresh = begin();
    dispatch(fresh, { type: "settle" });
    expect([fresh.ending, fresh.credits]).toEqual(["evicted", 12]);
  });
  it("requires earned trust and physical collection for the safe relay route", () => {
    const s = begin();
    expect(
      dispatch(s, {
        type: "accept-job",
        jobId: "offgrid-relay",
        at: "underground-contact",
      }).ok,
    ).toBe(false);
    finish(s, "pump-audit");
    finish(s, "meter-witness");
    expect(dispatch(s, { type: "accept-job", jobId: "offgrid-relay" }).ok).toBe(
      false,
    );
    finish(s, "offgrid-relay");
    dispatch(s, { type: "buy-ration" });
    dispatch(s, { type: "settle" });
    expect([s.ending, s.credits, s.hours, s.citizenship]).toEqual([
      "housed",
      10,
      0,
      "recognized",
    ]);
  });
  it("uses uninterrupted exposure, enforces once, and rejects frozen-key spending", () => {
    const s = begin();
    finish(s, "pump-audit");
    dispatch(s, {
      type: "accept-job",
      jobId: "offgrid-relay",
      at: "underground-contact",
    });
    advanceSurveillance(s, 1.9, true);
    expect(s.keyFrozen).toBe(false);
    advanceSurveillance(s, 0.1, false);
    expect(s.exposureSeconds).toBe(0);
    advanceSurveillance(s, 1.9, true);
    expect(s.keyFrozen).toBe(false);
    advanceSurveillance(s, 0.1, true);
    expect([s.keyFrozen, s.citizenship, s.activeJob, s.hours]).toEqual([
      true,
      "revoked",
      null,
      2,
    ]);
    advanceSurveillance(s, 5, true);
    expect(s.hours).toBe(2);
    expect(dispatch(s, { type: "settle" }).ok).toBe(false);
    advanceCustody(s, 28);
    expect(s.custody?.phase).toBe("release");
    expect(dispatch(s, { type: "release-custody" }).ok).toBe(true);
    const credits = s.credits;
    expect(dispatch(s, { type: "buy-ration" }).ok).toBe(false);
    expect(dispatch(s, { type: "borrow" }).ok).toBe(false);
    expect(dispatch(s, { type: "accept-job", jobId: "meter-witness" }).ok).toBe(
      false,
    );
    expect(s.credits).toBe(credits);
    expect(s.ledger.at(-1)?.accepted).toBe(false);
    dispatch(s, { type: "settle" });
    expect([s.ending, s.credits]).toEqual(["denaturalized", credits]);
  });
  it("keeps the west service route outside the exact visible scanner triangle", () => {
    expect(insideScanner(0, 0)).toBe(true);
    expect(insideScanner(0, -5)).toBe(true);
    expect(insideScanner(-10, -3)).toBe(false);
    expect(insideScanner(3, 2)).toBe(false);
    const s = begin();
    advanceSurveillance(s, 10, true);
    expect(s.keyFrozen).toBe(false);
  });
  it("charges one optional shower and records duplicate, insufficient and frozen refusals", () => {
    const s = begin();
    expect(dispatch(s, { type: "buy-shower" }).ok).toBe(true);
    expect([s.credits, s.showerConsumed, s.hours]).toEqual([10, true, 6]);
    expect(dispatch(s, { type: "buy-shower" }).ok).toBe(false);
    expect(s.credits).toBe(10);
    expect(s.ledger.at(-1)?.accepted).toBe(false);
    const poor = begin();
    poor.credits = 1;
    expect(dispatch(poor, { type: "buy-shower" }).ok).toBe(false);
    expect([poor.credits, poor.showerConsumed]).toEqual([1, false]);
    const frozen = begin();
    frozen.keyFrozen = true;
    expect(dispatch(frozen, { type: "buy-shower" }).ok).toBe(false);
    expect([frozen.credits, frozen.showerConsumed]).toEqual([12, false]);
    expect(frozen.ledger.at(-1)?.accepted).toBe(false);
  });
  it("completes exactly one ten-year sentence before release, preserving funds and enforcement", () => {
    const s = begin();
    expect(dispatch(s, { type: "recognition-inspection" }).ok).toBe(true);
    expect([s.credits, s.hours, s.custody]).toEqual([12, 6, null]);
    finish(s, "pump-audit");
    dispatch(s, {
      type: "accept-job",
      jobId: "offgrid-relay",
      at: "underground-contact",
    });
    dispatch(s, { type: "recognition-inspection" });
    const balance = s.credits;
    expect(s.custody?.phase).toBe("transport");
    expect(dispatch(s, { type: "release-custody" }).ok).toBe(false);
    expect(dispatch(s, { type: "recognition-inspection" }).ok).toBe(false);
    advanceCustody(s, 19.9);
    expect([s.custody?.phase, s.totalYearsServed]).toEqual(["sentence", 0]);
    advanceCustody(s, 0.1);
    expect([s.custody?.phase, s.totalYearsServed]).toEqual(["reupload", 10]);
    advanceCustody(s, 8);
    expect(s.custody?.phase).toBe("release");
    advanceCustody(s, 100);
    expect(s.totalYearsServed).toBe(10);
    expect(dispatch(s, { type: "release-custody" }).ok).toBe(true);
    expect(dispatch(s, { type: "release-custody" }).ok).toBe(false);
    advanceCustody(s, 100);
    expect([
      s.custody,
      s.totalYearsServed,
      s.credits,
      s.hours,
      s.keyFrozen,
      s.citizenship,
    ]).toEqual([null, 10, balance, 2, true, "revoked"]);
    dispatch(s, { type: "settle" });
    expect(s.ending).toBe("denaturalized");
  });
});
