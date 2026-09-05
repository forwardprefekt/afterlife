import { createWorld } from "./world";
import {
  createInitialState,
  dispatch,
  advanceSurveillance,
  advanceCustody,
} from "./game";
import { createUI } from "./ui";
import { JOBS } from "./content";
import type { LandmarkId } from "./content";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-800.css";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#ui")!;
try {
  const world = createWorld(
    document.querySelector<HTMLDivElement>("#district")!,
  );
  let state = createInitialState();
  let snapshot = world.update(0, {
    playing: false,
    paused: true,
    carrying: false,
  });
  let last = performance.now();
  const ui = createUI(
    root,
    () => state,
    (action, at) => {
      let required: LandmarkId | undefined;
      if (action.type === "buy-ration") required = "ration-shop";
      else if (action.type === "buy-shower") required = "shower";
      else if (action.type === "borrow") required = "credit-desk";
      else if (action.type === "settle") required = "home";
      else if (action.type === "interact") required = action.at;
      else if (action.type === "accept-job" && action.jobId === "offgrid-relay")
        required = "underground-contact";
      else if (action.type === "recognition-inspection") {
        if (at !== "street-officer" && at !== "indoor-officer")
          return {
            ok: false,
            message: "Present yourself to a recognition officer.",
          };
        required = at;
      } else if (
        action.type === "release-custody" &&
        !snapshot.jailExitReachable
      )
        return {
          ok: false,
          message: "Walk to the amber release gate inside processing.",
        };
      if (required && (at !== required || snapshot.nearest?.id !== required))
        return {
          ok: false,
          message: "Move within reach of the location on the correct floor.",
        };
      return dispatch(state, action);
    },
    () => {
      state = createInitialState();
      world.reset();
      last = performance.now();
    },
    (action) => {
      const result = world.act(action);
      snapshot = world.update(0, {
        playing: state.phase !== "intro",
        custody: state.custody,
        totalYearsServed: state.totalYearsServed,
        showerConsumed: state.showerConsumed,
        paused: ui.paused,
        carrying: Boolean(
          state.activeJob?.stage === "deliver" &&
          (state.activeJob.id === "stair-delivery" ||
            state.activeJob.id === "offgrid-relay"),
        ),
      });
      return result;
    },
    () => snapshot,
  );
  function frame(now: number) {
    const seconds = Math.max(0, (now - last) / 1000);
    last = now;
    const active = state.activeJob;
    if (!ui.paused && !document.hidden) advanceCustody(state, seconds);
    snapshot = world.update(seconds, {
      playing: state.phase !== "intro",
      custody: state.custody,
      totalYearsServed: state.totalYearsServed,
      showerConsumed: state.showerConsumed,
      paused: ui.paused,
      carrying: Boolean(
        active &&
        active.stage === "deliver" &&
        (active.id === "stair-delivery" || active.id === "offgrid-relay"),
      ),
      objective: active
        ? active.stage === "pickup"
          ? "parcel-depot"
          : JOBS[active.id].destination
        : state.hours === 0 || state.keyFrozen
          ? "home"
          : undefined,
    });
    const wasFrozen = state.keyFrozen;
    if (!ui.paused && !document.hidden)
      advanceSurveillance(state, seconds, snapshot.exposed);
    if (!wasFrozen && state.keyFrozen) {
      ui.refresh();
      ui.notify(
        "ARRESTED · Key frozen, recognition revoked. Custody transport and a ten-year consciousness sentence follow. You will be released back to the city.",
        false,
      );
    }
    ui.update(snapshot);
    world.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  root.innerHTML =
    '<section class="fatal"><div class="eyebrow">RENDERER UNAVAILABLE</div><h1>WebGL is required.</h1><p>AFTERLIFE needs a browser with WebGL enabled. Enable hardware acceleration or try a WebGL-capable browser, then reload.</p></section>';
}
