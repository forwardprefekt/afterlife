import { expect, it } from "vitest";
import * as THREE from "three";
import { insideDistrict, STREET_POCKETS } from "./content";
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

it("visits paired off-path places and rejoins circulation without leaving a stalled circuit", () => {
  const street = createStreetLife({ isBlocked: districtBlocked });
  const view = {
    paused: false,
    active: true,
    playerX: -14,
    playerY: 0,
    playerZ: -14,
    moving: true,
  };
  // Read the rendered bodies, not private routine state: a visit must be visible.
  const bodies = street.group.getObjectByName(
    "Resident and officer bodies",
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  function position(index: number) {
    bodies.getMatrixAt(index, matrix);
    return [matrix.elements[12], matrix.elements[14]] as const;
  }
  const initial = Array.from({ length: 96 }, (_, index) => position(index));
  let previous = initial;
  const distance = new Float64Array(96);
  const pairedDwell = new Float64Array(STREET_POCKETS.length);
  const visitors = STREET_POCKETS.map(
    () =>
      new Map<
        number,
        {
          entries: number;
          departures: number;
          dwell: number;
          longestDwell: number;
          atSpot: boolean;
          away: boolean;
        }
      >(),
  );
  for (let second = 0; second < 600; second++) {
    street.update(1, view);
    const current = initial.map((_, index) => position(index));
    for (let actor = 0; actor < current.length; actor++) {
      const [x, z] = current[actor];
      distance[actor] += Math.hypot(
        x - previous[actor][0],
        z - previous[actor][1],
      );
      STREET_POCKETS.forEach((pocket, pocketIndex) => {
        const near = pocket.positions.some(
          ([px, pz]) => Math.hypot(px - x, pz - z) < 0.025,
        );
        let visit = visitors[pocketIndex].get(actor);
        if (!visit && near) {
          visit = {
            entries: 0,
            departures: 0,
            dwell: 0,
            longestDwell: 0,
            atSpot: false,
            away: true,
          };
          visitors[pocketIndex].set(actor, visit);
        }
        if (!visit) return;
        if (near) {
          if (!visit.atSpot) visit.entries++;
          visit.dwell++;
          visit.longestDwell = Math.max(visit.longestDwell, visit.dwell);
          visit.away = false;
        } else {
          visit.dwell = 0;
          if (
            !visit.away &&
            pocket.positions.every(([px, pz]) => Math.hypot(px - x, pz - z) > 3)
          ) {
            visit.departures++;
            visit.away = true;
          }
        }
        visit.atSpot = near;
      });
    }
    visitors.forEach((pocketVisitors, index) => {
      let together = 0;
      for (const visit of pocketVisitors.values()) if (visit.atSpot) together++;
      if (together === 2) pairedDwell[index]++;
    });
    // Off-path pauses are finite; no departed leader may pin the rest of a route.
    if ((second + 1) % 120 === 0) {
      for (const walked of distance) expect(walked).toBeGreaterThan(8);
      distance.fill(0);
    }
    previous = current;
  }
  for (const pocketVisitors of visitors) {
    expect(pocketVisitors.size).toBe(2);
    for (const visit of pocketVisitors.values()) {
      expect(visit.entries).toBeGreaterThanOrEqual(2);
      expect(visit.departures).toBeGreaterThanOrEqual(2);
      expect(visit.longestDwell).toBeGreaterThanOrEqual(4);
    }
  }
  for (const secondsTogether of pairedDwell)
    expect(secondsTogether).toBeGreaterThanOrEqual(4);
  street.update(120, { ...view, paused: true });
  street.update(120, { ...view, active: false });
  for (const delta of [0, -1, NaN, Infinity]) street.update(delta, view);
  expect(initial.map((_, index) => position(index))).toEqual(previous);
  street.reset();
  expect(initial.map((_, index) => position(index))).toEqual(initial);
});

it("rejects an obstructed pocket connector even when both endpoints and the circuit are clear", () => {
  expect(() =>
    createStreetLife({
      isBlocked: (x, z) =>
        districtBlocked(x, z) ||
        (Math.abs(x + 10.8) < 0.15 && Math.abs(z - 31.68) < 0.15),
    }),
  ).toThrow(/Street pocket reclamation-yard blocked/);
});

it("recovers circulation after the player blocks a sidewalk beside a building", () => {
  const street = createStreetLife({
    isBlocked: (x, z) =>
      districtBlocked(x, z) ||
      (Math.abs(x + 5) < 5.45 / 2 + 0.28 && Math.abs(z - 28) < 5.05 / 2 + 0.28),
  });
  const view = {
    paused: false,
    active: true,
    playerX: -14,
    playerY: 0,
    playerZ: -14,
    moving: true,
  };
  const bodies = street.group.getObjectByName(
    "Resident and officer bodies",
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  function position(index: number) {
    bodies.getMatrixAt(index, matrix);
    return [matrix.elements[12], matrix.elements[14]] as const;
  }
  const southernResidents = Array.from(
    { length: bodies.count },
    (_, index) => index,
  ).filter((index) => {
    const [x, z] = position(index);
    return x < 10 && z >= 16;
  });
  for (let second = 0; second < 300; second++) street.update(1, view);
  for (let second = 0; second < 60; second++)
    street.update(1, { ...view, playerX: -8.1, playerZ: 32, moving: false });
  for (let second = 0; second < 120; second++) street.update(1, view);
  let previous = southernResidents.map(position);
  const walked = new Float64Array(southernResidents.length);
  for (let second = 0; second < 120; second++) {
    street.update(1, view);
    const current = southernResidents.map(position);
    for (let index = 0; index < current.length; index++)
      walked[index] += Math.hypot(
        current[index][0] - previous[index][0],
        current[index][1] - previous[index][1],
      );
    previous = current;
  }
  // A distant-corner sidestep can trap one walker against the neighboring block,
  // then pin everyone behind its projected route position after the player leaves.
  for (const distance of walked) expect(distance).toBeGreaterThan(8);
});
