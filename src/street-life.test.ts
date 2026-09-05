import { expect, it } from "vitest";
import { insideDistrict } from "./content";
import { createStreetLife } from "./street-life";

// The owner's two physical house footprints and bunker replace the old blocks.
// Include the same pedestrian radius that world.ts passes to street life.
const compoundFootprints = [
  { x: 28, z: 20, w: 14, d: 5 },
  { x: 28, z: 35.5, w: 14, d: 6 },
  { x: 44.55, z: 32.25, w: 4.5, d: 6.5 },
  { x: 38, z: 38, w: 0.7, d: 0.7 },
  { x: 28.3, z: 30.2, w: 0.7, d: 0.7 },
];
function districtBlocked(x: number, z: number) {
  return (
    !insideDistrict(x, z, 0.28) ||
    compoundFootprints.some(
      (footprint) =>
        Math.abs(x - footprint.x) < footprint.w / 2 + 0.28 &&
        Math.abs(z - footprint.z) < footprint.d / 2 + 0.28,
    )
  );
}

it("completes repeated patrol circuits through pedestrian crossings and honors pause and reset", () => {
  const street = createStreetLife({
    isBlocked: districtBlocked,
  });
  const view = {
    paused: false,
    active: true,
    playerX: -10,
    playerY: 0,
    playerZ: 13,
    moving: true,
  };
  const initial = street.update(0, view);
  expect(initial.crowdCount).toBe(112);
  expect(initial.policeCount).toBe(12);
  let reachedIndustry = false;
  let circuits = 0;
  for (let second = 0; second < 600; second++) {
    const state = street.update(1, view);
    if (state.patrolCarX > 20 && state.patrolCarZ > 20) reachedIndustry = true;
    if (
      reachedIndustry &&
      state.patrolCarX < -5 &&
      Math.abs(state.patrolCarZ - 16) < 1
    ) {
      circuits++;
      reachedIndustry = false;
    }
  }
  // Reaching the eastern arm alone missed a permanent turn/crowd deadlock.
  expect(circuits).toBeGreaterThanOrEqual(4);
  const before = street.update(0, view);
  const paused = street.update(5, { ...view, paused: true });
  expect([paused.patrolCarX, paused.patrolCarZ]).toEqual([
    before.patrolCarX,
    before.patrolCarZ,
  ]);
  street.reset();
  const reset = street.update(0, view);
  expect([reset.patrolCarX, reset.patrolCarZ]).toEqual([
    initial.patrolCarX,
    initial.patrolCarZ,
  ]);
});

it("rejects a blocked route edge rather than collapsing spawns onto a clear corner", () => {
  expect(() =>
    createStreetLife({
      // Corners remain clear, but a footprint blocks the first circuit midway.
      isBlocked: (x, z) =>
        districtBlocked(x, z) ||
        (Math.abs(x + 5) < 0.4 && Math.abs(z + 8.7) < 0.4),
    }),
  ).toThrow(/Street route blocked/);
});

it("waits for the player at a vehicle crossing and resumes when it clears", () => {
  const street = createStreetLife({ isBlocked: districtBlocked });
  const view = {
    paused: false,
    active: true,
    playerX: -5,
    playerY: 0,
    playerZ: 16,
    moving: false,
  };
  for (let frame = 0; frame < 600; frame++) {
    const state = street.update(1 / 30, view);
    expect(
      Math.hypot(
        state.patrolCarX - view.playerX,
        state.patrolCarZ - view.playerZ,
      ),
    ).toBeGreaterThanOrEqual(2.3);
  }
  const waiting = street.update(0, view);
  expect(waiting.patrolCarX).toBeGreaterThan(-10);
  expect(waiting.patrolCarX).toBeLessThan(-7.2);
  const resumed = street.update(12, { ...view, playerX: -14, playerZ: -14 });
  expect(resumed.patrolCarX).toBeGreaterThan(5);
});
