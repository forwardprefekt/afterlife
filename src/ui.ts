import {
  DISTRICT_BOUNDS,
  DISTRICT_OUTLINE,
  DISTRICT_ROADS,
  JOBS,
  landmark,
} from "./content";
import type { InteractionId, JobId, Landmark, LandmarkId } from "./content";
import { CUSTODY_DURATIONS, jobDisabledReason } from "./game";
import type { ActionResult, GameAction, GameState } from "./game";
import type { WorldAction, WorldSnapshot } from "./world";
import type { FurnitureId, HabitatFloor } from "./habitat";
import {
  INVESTIGATION_ACTIONS,
  INVESTIGATION_SITES,
  nextInvestigationStep,
} from "./investigation";
import type { InvestigationSite, InvestigationStep } from "./investigation";
import {
  renderInvestigationJournal,
  renderInvestigationActions,
  renderInvestigationEpilogue,
} from "./investigation-ui";

type Pane =
  | "none"
  | "work"
  | "wallet"
  | "citizen"
  | "investigation"
  | "place"
  | "settle"
  | "pause"
  | "furniture";
const endingCopy = {
  housed: [
    "Access renewed.",
    "Your room is still yours. For one more night.",
    "Housing paid. A meal consumed. No lender claim. Tomorrow remains outside this playable day.",
  ],
  hungry: [
    "A room. No meal.",
    "Your housing license survives. You go to bed hungry.",
    "The door accepts your key. The ration counter has closed for this shift.",
  ],
  indebted: [
    "A claim on tomorrow.",
    "You keep the room. The lender keeps a claim on you.",
    "Housing was settled first. The unpaid advance remains outstanding, in full.",
  ],
  evicted: [
    "Access withdrawn.",
    "The room has been reassigned.",
    "You could not settle the housing license. No housing payment was taken. Your belongings wait outside.",
  ],
  denaturalized: [
    "Resident not found.",
    "The city knows exactly who you are. It no longer recognizes you.",
    "Your key is frozen. Your funds remain visible but inaccessible. No housing or loan deductions were made.",
  ],
} as const;

export function createUI(
  root: HTMLElement,
  state: () => GameState,
  perform: (action: GameAction, at?: LandmarkId) => ActionResult,
  restart: () => void,
  operate: (action: WorldAction) => ActionResult,
  worldState: () => WorldSnapshot,
) {
  let pane: Pane = "none",
    place: Landmark | undefined,
    lastFocus: HTMLElement | null = null;
  let nearest: Landmark | undefined,
    toastUntil = 0,
    detailed = false;
  let selectedFurniture: FurnitureId = "bed",
    lastNotice = -1,
    ambientUntil = 0;
  root.innerHTML = `<header class="masthead"><div class="wordmark">AFTERLIFE<span>MERIDIAN COMPACT / DISTRICT 09</span></div><div class="edition">CIVIC OPERATING SYSTEM <b>● ONLINE</b></div></header>
    <div class="hud" aria-label="Shift status"><div><label>AVAILABLE CREDIT</label><strong id="credits">0 <em>AC</em></strong></div><div><label>WORK ALLOCATION</label><strong id="hours">6 <em>HRS</em></strong></div><div class="hud-minor"><label>HOUSING DUE</label><b>40 AC</b></div><div class="hud-minor"><label>DAILY RATION</label><b id="ration">NOT CONSUMED</b></div><div class="identity"><i></i><span id="identity">RECOGNIZED / KEY ACTIVE</span></div></div>
    <div class="district-caption"><span class="tiny-rule"></span> LOWER MERIDIAN <small>RESIDENTIAL & UTILITY SECTOR</small></div>
    <div class="minimap" aria-label="District navigation map"><div>SECTOR 09 <span>N ↗</span></div><svg viewBox="${DISTRICT_BOUNDS.minX - 1} ${DISTRICT_BOUNDS.minZ - 1} ${DISTRICT_BOUNDS.maxX - DISTRICT_BOUNDS.minX + 2} ${DISTRICT_BOUNDS.maxZ - DISTRICT_BOUNDS.minZ + 2}" role="img" aria-label="District map: player and objective"><g class="street-map"><polygon points="${DISTRICT_OUTLINE.map((p) => p.join(",")).join(" ")}" fill="#23373b" stroke="#8ba39d" stroke-width=".4"/><path d="${DISTRICT_ROADS.map((r) => `M${r.from.join(" ")}L${r.to.join(" ")}`).join("")}" stroke="#72847b" stroke-width="1.3"/><path d="M0 3L-4 -5H4Z" fill="#cb866a" opacity=".45"/><path d="M10 -2V-12" stroke="#e6c278" stroke-width="1.3" stroke-dasharray=".3 .4"/></g><circle id="map-goal" r="1.2" fill="none" stroke="#e6c278" stroke-width=".4"/><circle id="map-player" r=".8" fill="#f8f0ce" stroke="#13272b" stroke-width=".3"/></svg><small><i></i> YOU <i class="goal-dot"></i> DESTINATION</small></div>
    <div class="objective"><div class="objective-index">01</div><div><label id="objective-label">TODAY'S PRIORITY</label><strong id="objective-title">Earn the right to stay.</strong><p id="objective-detail">40 for housing. 6 for a meal. Six work hours.</p></div><button data-command="work" aria-label="Open work handset">↗</button></div>
    <button class="handset-button" data-command="work"><span class="phone-icon">▯</span> HANDSET <span id="handset-compass" class="handset-compass" hidden aria-label="Active destination direction">↑</span><kbd>TAB</kbd></button>
    <div id="interaction" class="interaction" hidden></div><div id="exposure" class="exposure" hidden><div>UNREGISTERED COMPONENT DETECTED <span id="exposure-time"></span></div><div class="exposure-track"><i></i></div><small>LEAVE THE SCANNER · 2 SECONDS TO ENFORCEMENT</small></div>
    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
    <footer class="controls"><span><kbd>W A S D</kbd> MOVE</span><span><kbd>E</kbd> INTERACT</span><span><kbd>TAB</kbd> HANDSET</span><span><kbd>ESC</kbd> PAUSE</span><span class="scroll-hint">SCROLL TO ZOOM</span><span class="desktop-notice">DESKTOP CONTROLS REQUIRED</span></footer><div id="panels"></div>`;
  const panels = root.querySelector<HTMLDivElement>("#panels")!;
  const credits = root.querySelector("#credits")!,
    hours = root.querySelector("#hours")!,
    ration = root.querySelector("#ration")!,
    identity = root.querySelector("#identity")!;
  const prompt = root.querySelector<HTMLDivElement>("#interaction")!,
    exposure = root.querySelector<HTMLDivElement>("#exposure")!,
    toast = root.querySelector<HTMLDivElement>("#toast")!;
  const mapPlayer = root.querySelector("#map-player")!,
    mapGoal = root.querySelector("#map-goal")!;
  const objectiveLabel = root.querySelector("#objective-label")!,
    objectiveTitle = root.querySelector("#objective-title")!,
    objectiveDetail = root.querySelector("#objective-detail")!;
  const objectiveButton = root.querySelector<HTMLButtonElement>(
    ".objective > button",
  )!;
  const handsetButton =
    root.querySelector<HTMLButtonElement>(".handset-button")!;
  root.insertAdjacentHTML(
    "beforeend",
    `<div id="ambient" class="ambient" role="status" aria-live="polite" hidden><label>PUBLIC ADDRESS / CIVIC DRONE</label><p></p></div><div id="street-status" class="street-status"></div><div id="housing-banner" class="housing-banner" hidden></div><div id="ride-indicator" class="ride-indicator" hidden><label>HABITAT 09 / PASSENGER LIFT</label><strong>IN TRANSIT</strong><p>Keep clear of the doors.</p></div>`,
  );
  const ambient = root.querySelector<HTMLDivElement>("#ambient")!;
  const streetStatus = root.querySelector<HTMLDivElement>("#street-status")!;
  const housingBanner = root.querySelector<HTMLDivElement>("#housing-banner")!;
  const rideIndicator = root.querySelector<HTMLDivElement>("#ride-indicator")!;
  root.insertAdjacentHTML(
    "beforeend",
    `<aside id="custody-status" class="custody-status" hidden aria-live="polite"><label>MERIDIAN / CONSCIOUSNESS CORRECTION</label><strong></strong><p></p><small></small><button data-command="release-custody" hidden>Leave custody · E</button></aside>`,
  );
  const custodyStatus = root.querySelector<HTMLDivElement>("#custody-status")!;
  const compass = root.querySelector<HTMLSpanElement>("#handset-compass")!;
  const mapSvg = root.querySelector<SVGSVGElement>(".minimap svg")!;
  mapSvg
    .querySelector(".street-map")!
    .insertAdjacentHTML(
      "beforeend",
      '<g fill="#879387" stroke="#c6b58a" stroke-width=".35"><rect x="21" y="17.5" width="14" height="5"/><rect x="21" y="32.5" width="14" height="6"/><rect x="42.3" y="29" width="4.5" height="6.5" fill="#15262b"/></g>',
    );
  let mapKey = "";
  const mapHeading = root.querySelector(".minimap > div")!;
  mapGoal.insertAdjacentHTML(
    "beforebegin",
    `<g class="interior-map"><rect x="-12" y="-10" width="24" height="20" fill="#304549" stroke="#8ba39d" stroke-width=".2"/><path d="M0 -8V9M-11 0H11" stroke="#a5b4a7" stroke-width="2"/><path d="M-10 -6H-3M3 -6H10M-10 5H-3M4 5H8" stroke="#647e78" stroke-width="4"/><rect x="-1.5" y="-8.5" width="3" height="3" fill="#e6c278"/><rect x="4" y="2.5" width="4" height="4" fill="none" stroke="#e6c278" stroke-width=".35"/></g>`,
  );

  function notify(message: string, ok = true) {
    toast.textContent = message;
    toast.classList.toggle("error", !ok);
    toast.hidden = false;
    toastUntil = performance.now() + 6000;
  }
  function ledger(s: GameState) {
    return `<div class="ledger">${s.ledger.map((row) => `<div class="ledger-row ${row.accepted ? "" : "rejected"}"><div><strong>${row.description}</strong><small>${row.accepted ? "SETTLED" : "REJECTED"} · BALANCE ${row.balance} AC</small><p>${row.reason}</p></div><b>${row.amount > 0 ? "+" : ""}${row.amount}<em> AC</em></b></div>`).join("") || "<p>No transactions recorded.</p>"}</div>`;
  }
  function close() {
    if (pane === "furniture") operate({ type: "select-furniture" });
    pane = "none";
    place = undefined;
    detailed = false;
    render();
    lastFocus?.focus({ preventScroll: true });
  }
  function open(next: Pane) {
    if (pane === "furniture" && next !== "furniture")
      operate({ type: "select-furniture" });
    lastFocus = document.activeElement as HTMLElement;
    pane = next;
    detailed = false;
    render();
  }
  function execute(action: GameAction, at?: LandmarkId, closeAfter = false) {
    const result = perform(action, at);
    if (result.ok && closeAfter) {
      pane = "none";
      place = undefined;
    }
    render();
    notify(result.message, result.ok);
  }
  function executeWorld(action: WorldAction, closeAfter = false) {
    const result = operate(action);
    if (result.ok && closeAfter) {
      pane = "none";
      place = undefined;
    }
    render();
    notify(result.message, result.ok);
  }

  function renderFurniture() {
    const { furniture, roomBounds: bounds } = worldState();
    const selected = furniture.find((item) => item.id === selectedFurniture)!;
    const width = bounds.maxX - bounds.minX,
      depth = bounds.maxZ - bounds.minZ;
    return `<section class="handset panel furnishing" role="dialog" aria-label="Arrange your capsule"><div class="handset-top"><span>BERTH 0806 / PERSONAL SPACE</span><button class="close" data-command="close" aria-label="Close furniture arrangement">×</button></div><div class="handset-content"><div class="app-heading"><h2>A place for your things.</h2><p>Four possessions. ${Math.round(width * depth)} square meters. Nothing to spare.</p></div><svg class="room-plan" viewBox="${bounds.minX - 0.2} ${bounds.minZ - 0.2} ${width + 0.4} ${depth + 0.4}" role="img" aria-label="Your room furniture layout"><rect x="${bounds.minX}" y="${bounds.minZ}" width="${width}" height="${depth}" fill="#233b40" stroke="#90a39a" stroke-width=".035"/><path d="M5.5 ${bounds.minZ}H6.5" stroke="#e6c278" stroke-width=".12"/>${furniture.map((item, i) => `<g><rect x="${item.x - item.w / 2}" y="${item.z - item.d / 2}" width="${item.w}" height="${item.d}" rx=".05" fill="${item.id === selectedFurniture ? "#d8b76f" : "#63877f"}" stroke="#152b30" stroke-width=".035"/><text x="${item.x}" y="${item.z + 0.08}" text-anchor="middle" font-size=".25" fill="#14272c">${i + 1}</text></g>`).join("")}</svg><div class="furniture-list">${furniture.map((item, i) => `<button data-furniture="${item.id}" aria-pressed="${item.id === selectedFurniture}"><span>0${i + 1}</span>${item.name}</button>`).join("")}</div><label class="section-label">${selected.name.toUpperCase()} / MOVE 0.25 M</label><div class="arrange-controls"><button data-move="north" aria-label="Move furniture north">↗ North</button><button data-move="south" aria-label="Move furniture south">↙ South</button><button data-move="west" aria-label="Move furniture west">↖ West</button><button data-move="east" aria-label="Move furniture east">↘ East</button><button data-move="rotate">Rotate 90°</button></div><p class="furniture-reason">No overlap. No blocked doorway. These are the limits of your freedom here.</p><small>Changes are immediate and kept when you leave. Restarting or reloading resets the day and your room. Nothing costs credits.</small></div><div class="handset-bottom"><i></i> YOUR BELONGINGS. THEIR FLOOR. <span>ESC CLOSES</span></div></section>`;
  }
  function render() {
    const s = state();
    const preserveArrangement =
      pane === "furniture" && Boolean(panels.querySelector(".furnishing"));
    const savedScroll = preserveArrangement
      ? panels.querySelector(".handset-content")!.scrollTop
      : 0;
    const focused = document.activeElement as HTMLElement | null;
    const focusSelector =
      preserveArrangement && focused?.dataset.move
        ? `[data-move="${focused.dataset.move}"]`
        : preserveArrangement && focused?.dataset.furniture
          ? `[data-furniture="${focused.dataset.furniture}"]`
          : "button:not(:disabled)";
    root.classList.toggle("in-shift", s.phase === "playing");
    root.classList.toggle(
      "has-panel",
      pane !== "none" || s.phase !== "playing",
    );
    credits.innerHTML = `${s.credits} <em>AC</em>`;
    hours.innerHTML = `${s.hours} <em>HRS</em>`;
    ration.textContent = s.rationConsumed ? "CONSUMED" : "NOT CONSUMED";
    ration.classList.toggle("positive", s.rationConsumed);
    identity.textContent = `${s.citizenship.toUpperCase()} / KEY ${s.keyFrozen ? "FROZEN" : "ACTIVE"}`;
    root.querySelector(".identity")!.classList.toggle("revoked", s.keyFrozen);
    if (s.phase === "intro") {
      panels.innerHTML = `<section class="intro"><div class="eyebrow"><span class="live-dot"></span> ONE DISTRICT. SIX HOURS. YOUR ROOM.</div><h1>A living.<br>Not a life.</h1><p class="subtitle">A day in the Meridian Compact</p><p>Your stipend has cleared. Housing is due at shift end. Six work hours remain.</p><button class="primary" data-command="begin">Begin shift <span>↗</span></button><small>One playable day. Reloading starts a new day.</small><div class="intro-footnote">A FICTIONAL FUTURE. AN ORDINARY WORKDAY.</div></section><div class="scene-note"><span>09 / MERIDIAN</span><p>Everything you need.<br>Nothing you own.</p></div>`;
    } else if (s.phase === "ended") {
      const copy = endingCopy[s.ending!];
      panels.innerHTML = `<div class="scrim"><section class="ending panel" role="dialog" aria-modal="true" aria-labelledby="ending-title"><div class="panel-eyebrow">SHIFT 001 / SETTLEMENT COMPLETE <span>${s.ending!.toUpperCase()}</span></div><div class="ending-grid"><div class="ending-story"><h1 id="ending-title">${copy[0]}</h1><h3>${copy[1]}</h3><p>${copy[2]}</p><div class="settlement-stats"><div><label>REMAINING</label><strong>${s.credits}<em> AC</em></strong></div><div><label>DEBT</label><strong>${s.loan}<em> AC</em></strong></div><div><label>HOURS</label><strong>${s.hours}</strong></div></div><small>RATION ${s.rationConsumed ? "CONSUMED" : "NOT CONSUMED"}<br>${s.citizenship.toUpperCase()} · KEY ${s.keyFrozen ? "FROZEN" : "ACTIVE"}</small><button class="primary" data-command="restart">Restart day <span>↗</span></button><small>Restart clears the day, investigation and acquired access.</small></div><div class="ending-record"><label>ISSUER-CONTROLLED SETTLEMENT</label>${ledger(s)}<label>COMPLETED ASSIGNMENTS · ${s.completedJobs.length}</label><ul>${s.completedJobs.map((id) => `<li>${JOBS[id].name}</li>`).join("") || "<li>None</li>"}</ul>${renderInvestigationEpilogue(s)}</div></div></section></div>`;
    } else if (pane === "none") panels.innerHTML = "";
    else if (pane === "furniture") panels.innerHTML = renderFurniture();
    else if (
      pane === "work" ||
      pane === "wallet" ||
      pane === "citizen" ||
      pane === "investigation"
    ) {
      let content = "";
      if (pane === "work") {
        content = `<div class="app-heading"><h2>Labor exchange</h2><p>Human presence. Machine purpose.</p></div>${s.keyFrozen ? '<div class="warning">ACCESS DENIED<br>Citizenship revoked. Your work key is frozen.</div>' : ""}${s.activeJob ? `<div class="active-assignment"><label>ACTIVE ASSIGNMENT</label><h3>${JOBS[s.activeJob.id].name}</h3><p>${s.activeJob.stage === "pickup" ? `Collect the parcel at ${landmark("parcel-depot").name}.` : `Deliver / ${landmark(JOBS[s.activeJob.id].destination).name}`}</p><button data-command="abandon">Abandon job</button></div>` : ""}<div class="job-list">${Object.values(
          JOBS,
        )
          .filter((j) => j.id !== "offgrid-relay")
          .map((job, i) => {
            const reason = jobDisabledReason(s, job.id);
            return `<article class="job"><div class="job-top"><span>0${i + 1} / CIVIC CONTRACT</span><b>${job.reward}<em> AC</em></b></div><h3>${job.name}</h3><p>${job.description}</p><div class="job-meta"><span>◷ ${job.hours} WORK HOURS</span><span>↗ ${landmark(job.id === "stair-delivery" ? "parcel-depot" : job.destination).name.toUpperCase()}</span></div><button data-job="${job.id}" ${reason ? "disabled" : ""}>${s.completedJobs.includes(job.id) ? "Assignment completed" : "Accept assignment"}</button>${reason ? `<small>${reason}</small>` : ""}</article>`;
          })
          .join(
            "",
          )}</div><div class="quiet-note">Other work travels by word of mouth. Find Mara on the west service route after a civic job.</div>`;
      } else if (pane === "wallet")
        content = `<div class="app-heading"><h2>Wallet</h2><p>Issuer-controlled settlement.</p></div><div class="wallet-balance"><label>AVAILABLE BALANCE ${s.keyFrozen ? " / FROZEN" : ""}</label><strong>${s.credits}<em> AC</em></strong><p>Housing due: 40 AC · Debt due: ${s.loan} AC</p></div><div class="quiet-note">Employer-issued AI credits. The issuer authorizes every transfer, including those arranged off-network.</div><label class="section-label">GOVERNMENT-ADMINISTERED LEDGER</label>${ledger(s)}`;
      else if (pane === "citizen")
        content = `<div class="app-heading"><h2>Citizen record</h2><p>Recognition is a service. Not a right.</p></div><div class="citizen-card"><div class="portrait">0806</div><label>MERIDIAN RESIDENT / CLASS C</label><h3>${s.citizenship.toUpperCase()}</h3><small>TRANSACTION KEY: ${s.keyFrozen ? "FROZEN" : "ACTIVE"}<br>TOTAL YEARS SERVED: ${s.totalYearsServed}</small></div><h3>A revocable room.</h3><p>Your housing license costs 40 credits at settlement. Your ration costs another 6. Walking and reading do not consume work hours; completed assignments do.</p><h3>A conditional border.</h3><p>Regional transit requires recognized citizenship. Participating compacts share identity screening and surveillance records. A completed consciousness sentence does not restore your key. Years served persist until you restart this day.</p><div class="quiet-note">The Meridian Compact and its institutions are fictional. This is not a description of real US law or history.</div>`;
      else content = renderInvestigationJournal(s);
      panels.innerHTML = `<section class="handset panel has-investigation" role="dialog" aria-label="Civic handset"><div class="handset-top"><span>MERIDIAN / PERSONAL TERMINAL</span><button class="close" data-command="close" aria-label="Close handset">×</button></div><div class="tabs" role="tablist">${(["work", "wallet", "citizen", "investigation"] as const).map((name) => `<button role="tab" aria-selected="${pane === name}" data-command="${name}">${name === "investigation" ? "Casefile" : name[0].toUpperCase() + name.slice(1)}</button>`).join("")}</div><div class="handset-content">${content}</div><div class="handset-bottom"><i></i> ↑↓ SELECT · ENTER CONFIRM <span>TAB CLOSES</span></div></section>`;
    } else if (pane === "pause")
      panels.innerHTML = `<div class="scrim"><section class="dialog panel" role="dialog" aria-modal="true" aria-label="Shift paused"><div class="panel-eyebrow">SHIFT PAUSED</div><h2>Take a moment.</h2><p>Movement, surveillance, custody and lifts pause while a menu is open. Work hours are spent on assignments, not on walking or reading.</p><button class="primary" data-command="close">Resume shift</button><button data-command="restart">Restart day</button><small>Restart discards this shift, investigation, room arrangement and cumulative years served. Reloading also begins a new day.</small></section></div>`;
    else if (pane === "settle")
      panels.innerHTML = `<div class="scrim"><section class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="settle-title"><div class="panel-eyebrow">HOUSING LICENSE / H-09</div><h2 id="settle-title">Close the day?</h2><p>Unfinished assignments are discarded without pay. Housing is settled before any loan repayment.</p>${s.investigation.accepted && !s.investigation.exposed ? '<div class="warning">Your investigation is unfinished. Ending the shift closes it without transmitting the remaining evidence.</div>' : ""}<dl class="bill"><div><dt>Available balance</dt><dd>${s.credits} AC</dd></div><div><dt>Housing charge</dt><dd>40 AC</dd></div><div><dt>Loan due</dt><dd>${s.loan} AC</dd></div><div><dt>Daily ration</dt><dd>${s.rationConsumed ? "Consumed" : "Not consumed"}</dd></div></dl>${s.keyFrozen ? '<div class="warning">Recognition revoked. No funds can be transferred.</div>' : ""}<button class="primary" data-command="settle">Confirm settlement</button><button data-command="close">Not yet</button></section></div>`;
    else if (place) {
      let action = "";
      if (place.id === "habitat-entry")
        action =
          '<button class="primary" data-command="enter-habitat">Enter Habitat 09 ↗</button>';
      else if (place.id === "habitat-exit")
        action =
          '<button class="primary" data-command="exit-habitat">Step out to the street ↗</button>';
      else if (place.id === "elevator")
        action = `<div class="elevator-buttons">${([0, 1, 3] as const).map((floor) => `<button data-floor="${floor}" ${worldState().floor === floor ? "disabled" : ""}><b>${floor === 0 ? "G" : `0${floor}`}</b><span>${floor === 0 ? "Ground / street exit" : floor === 1 ? "Sleeping hall / shared washroom" : "Berth 0806 / your room"}</span><em>${worldState().floor === floor ? "HERE" : "↑↓"}</em></button>`).join("")}</div><small>Passenger access remains available even if your transaction key is frozen.</small>`;
      else if (place.id === "furniture")
        action =
          '<button class="primary" data-command="arrange">Arrange your belongings</button>';
      else if (place.id === "home")
        action =
          '<button class="primary" data-command="confirm">Settle housing and end shift</button><button data-command="arrange">Arrange your belongings</button>';
      else if (place.id === "work-terminal")
        action =
          '<button class="primary" data-command="work">Open labor exchange</button>';
      else if (place.id === "ration-shop")
        action = `<button class="primary" data-command="ration" ${s.rationConsumed ? "disabled" : ""}>${s.rationConsumed ? "Ration already consumed" : "Buy ration — 6 credits"}</button>`;
      else if (place.id === "shower")
        action = `<button class="primary" data-command="shower" ${s.showerConsumed ? "disabled" : ""}>${s.showerConsumed ? "Shower paid this shift" : "Reserve metered shower — 2 AC"}</button><small>Optional. Once per shift. Bay 06 is the last bay on the right; step under its head after payment. No work hours used.</small>`;
      else if (place.id === "street-officer" || place.id === "indoor-officer")
        action = `<p>Voluntary inspections are free. An unregistered relay component carries a mandatory ten-year consciousness sentence. Serving a sentence does not restore recognition or unfreeze your funds.</p><button class="primary" data-command="inspect">Present key and cargo for inspection</button>`;
      else if (place.id === "credit-desk")
        action = `<button class="primary" data-command="borrow" ${s.loanTaken ? "disabled" : ""}>${s.loanTaken ? "Advance already issued" : "Borrow 10 — repay 12 at settlement"}</button>`;
      else if (place.id === "underground-contact") {
        const reason = jobDisabledReason(s, "offgrid-relay");
        action = `<div class="underground-offer"><label>PRIVATE MAINTENANCE / 18 AC / 2 HOURS</label><p>${JOBS["offgrid-relay"].description}</p><small>Payment comes from a resident, in issuer-controlled AI credits. Prohibited independently hosted AI carries summary execution; you are carrying a component, not operating an AI.</small><button class="primary" data-job="offgrid-relay" ${reason ? "disabled" : ""}>Take relay component</button>${reason ? `<small>${reason}</small>` : ""}</div>`;
      } else if (
        s.activeJob &&
        ((s.activeJob.stage === "deliver" &&
          JOBS[s.activeJob.id].destination === place.id) ||
          (place.id === "parcel-depot" &&
            s.activeJob.id === "stair-delivery" &&
            s.activeJob.stage === "pickup"))
      )
        action = `<button class="primary" data-command="interact">${s.activeJob.stage === "pickup" ? "Collect parcel" : JOBS[s.activeJob.id].verb}</button>`;
      const storyActions = renderInvestigationActions(
        place,
        s,
        worldState().investigationSite,
      );
      if (storyActions !== undefined)
        action =
          place.id === "underground-contact"
            ? action + storyActions
            : storyActions;
      const denied =
        place.id === "border-terminal" && s.citizenship === "revoked";
      panels.innerHTML = `<div class="scrim"><section class="dialog panel" role="dialog" aria-modal="true" aria-labelledby="place-title"><div class="panel-eyebrow">${place.sector}<button class="close" data-command="close" aria-label="Close interaction">×</button></div><h2 id="place-title">${place.name}</h2><p class="dialog-copy">${place.text}</p>${denied ? '<div class="warning">TRANSIT DENIED · CITIZENSHIP REVOKED<br>Record shared with participating compacts.</div>' : ""}${detailed && place.details ? `<p class="details-copy">${place.details}</p>` : ""}${action}${place.details && !detailed ? '<button class="text-button" data-command="details">Tell me more ↗</button>' : ""}<button class="text-button" data-command="close">Keep walking <kbd>ESC</kbd></button></section></div>`;
    }
    // Keep repeated quarter-step edits under the pointer and keyboard focus.
    if (panels.innerHTML)
      queueMicrotask(() => {
        if (preserveArrangement)
          panels.querySelector(".handset-content")!.scrollTop = savedScroll;
        panels
          .querySelector<HTMLButtonElement>(focusSelector)
          ?.focus({ preventScroll: true });
      });
  }
  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!button || button.disabled) return;
    if (
      button.dataset.storyStep &&
      place &&
      button.dataset.storyStep in INVESTIGATION_ACTIONS
    ) {
      execute(
        {
          type: "investigate",
          step: button.dataset.storyStep as InvestigationStep,
          at: place.id,
        },
        place.id,
      );
      return;
    }
    if (
      button.dataset.storyEnter &&
      button.dataset.storyEnter in INVESTIGATION_SITES
    ) {
      executeWorld(
        {
          type: "enter-investigation",
          site: button.dataset.storyEnter as InvestigationSite,
        },
        true,
      );
      return;
    }
    if (
      button.dataset.storyRide &&
      ["bunker", "detention", "routing"].includes(button.dataset.storyRide)
    ) {
      executeWorld(
        {
          type: "ride-depths",
          site: button.dataset.storyRide as "bunker" | "detention" | "routing",
        },
        true,
      );
      return;
    }
    if (button.dataset.storyExit) {
      executeWorld({ type: "exit-investigation" }, true);
      return;
    }
    if (button.dataset.storyTrack !== undefined) {
      execute({
        type: "track-investigation",
        tracking: button.dataset.storyTrack === "true",
      });
      return;
    }
    if (button.dataset.floor !== undefined) {
      executeWorld(
        {
          type: "ride-elevator",
          floor: Number(button.dataset.floor) as HabitatFloor,
        },
        true,
      );
      return;
    }
    if (button.dataset.furniture) {
      const id = button.dataset.furniture as FurnitureId;
      const result = operate({ type: "select-furniture", item: id });
      if (result.ok) selectedFurniture = id;
      render();
      return;
    }
    if (button.dataset.move) {
      const direction = button.dataset.move;
      executeWorld({
        type: "move-furniture",
        item: selectedFurniture,
        dx: direction === "east" ? 0.25 : direction === "west" ? -0.25 : 0,
        dz: direction === "south" ? 0.25 : direction === "north" ? -0.25 : 0,
        rotate: direction === "rotate",
      });
      return;
    }
    if (button.dataset.job) {
      execute(
        {
          type: "accept-job",
          jobId: button.dataset.job as JobId,
          at:
            place?.id === "underground-contact"
              ? "underground-contact"
              : undefined,
        },
        place?.id,
        true,
      );
      return;
    }
    switch (button.dataset.command) {
      case "enter-habitat":
        executeWorld({ type: "enter-habitat" }, true);
        break;
      case "exit-habitat":
        executeWorld({ type: "exit-habitat" }, true);
        break;
      case "arrange": {
        const result = operate({
          type: "select-furniture",
          item: selectedFurniture,
        });
        if (result.ok) open("furniture");
        else notify(result.message, false);
        break;
      }
      case "begin":
        execute({ type: "begin" });
        break;
      case "close":
        close();
        break;
      case "work":
      case "wallet":
      case "citizen":
      case "investigation":
        open(button.dataset.command);
        break;
      case "restart":
        pane = "none";
        place = undefined;
        ambient.hidden = true;
        lastNotice = -1;
        selectedFurniture = "bed";
        restart();
        render();
        break;
      case "details":
        detailed = true;
        render();
        break;
      case "confirm":
        pane = "settle";
        render();
        break;
      case "settle":
        execute({ type: "settle" }, "home");
        break;
      case "ration":
        execute({ type: "buy-ration" }, place?.id);
        break;
      case "shower":
        execute({ type: "buy-shower" }, place?.id);
        break;
      case "inspect":
        execute({ type: "recognition-inspection" }, place?.id, true);
        break;
      case "release-custody":
        execute({ type: "release-custody" }, undefined, true);
        break;
      case "borrow":
        execute({ type: "borrow" }, place?.id);
        break;
      case "interact":
        execute(
          { type: "interact", at: place!.id as InteractionId },
          place?.id,
          true,
        );
        break;
      case "abandon":
        execute({ type: "abandon-job" });
        break;
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.repeat || state().phase !== "playing") return;
    if (
      pane !== "none" &&
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)
    ) {
      event.preventDefault();
      const buttons = [
        ...panels.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ];
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const direction =
        event.code === "ArrowUp" || event.code === "ArrowLeft" ? -1 : 1;
      buttons[(index + direction + buttons.length) % buttons.length]?.focus();
      return;
    }
    if (event.code === "Escape") {
      event.preventDefault();
      if (pane !== "none") close();
      else open("pause");
    } else if (event.code === "Tab") {
      if (
        pane === "none" ||
        pane === "work" ||
        pane === "wallet" ||
        pane === "citizen" ||
        pane === "investigation"
      ) {
        event.preventDefault();
        if (pane === "none")
          open(state().investigation.tracking ? "investigation" : "work");
        else close();
      }
    } else if (
      event.code === "KeyE" &&
      pane === "none" &&
      state().custody?.phase === "release" &&
      worldState().jailExitReachable
    ) {
      event.preventDefault();
      execute({ type: "release-custody" });
    } else if (
      event.code === "KeyE" &&
      pane === "none" &&
      nearest &&
      !state().custody
    ) {
      event.preventDefault();
      place = nearest;
      open("place");
    }
    // Modal Tab navigation stays inside its visible panel. Handset has its own Tab toggle.
    if (
      event.code === "Tab" &&
      pane !== "none" &&
      !["work", "wallet", "citizen", "investigation"].includes(pane)
    ) {
      const buttons = [
        ...panels.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ];
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0]?.focus();
      }
    }
  });
  window.addEventListener("blur", () => {
    if (state().phase === "playing" && pane === "none") open("pause");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state().phase === "playing" && pane === "none")
      open("pause");
  });
  render();
  return {
    get paused() {
      return pane !== "none" || state().phase !== "playing";
    },
    refresh: render,
    notify,
    update(snapshot: WorldSnapshot) {
      const s = state();
      const custody = s.custody;
      root.classList.toggle("in-custody", Boolean(custody));
      custodyStatus.hidden = !custody;
      if (custody) {
        const copy = {
          transport: [
            "CUSTODY TRANSPORT",
            "Your component has been seized. The vehicle is taking you to consciousness processing.",
          ],
          processing: [
            "BODY IN PROCESSING",
            "Your body is secured in the processing chair. A ten-year consciousness sentence is authorized.",
          ],
          upload: [
            "CONSCIOUSNESS UPLOAD",
            "Separating the resident record from the body. The chair retains your body.",
          ],
          sentence: [
            "TEN YEARS · TORMENT PROTOCOL",
            "All ten subjective years are experienced in accelerated confinement. Your physical body remains in secure storage.",
          ],
          reupload: [
            "RETURNING CONSCIOUSNESS",
            "Ten years completed. Reuploading your consciousness to the body in processing.",
          ],
          announcement: [
            "10 YEARS SERVED!",
            "“Wonderful! Ten years served. Thank you for improving yourself. Have a lovely day!”",
          ],
          release: [
            "RELEASE AUTHORIZED",
            "Walk to the amber gate at the front-left of the room and press E. Your key remains frozen; your housing settlement is still reachable.",
          ],
        } as const;
        custodyStatus.querySelector("strong")!.textContent =
          copy[custody.phase][0];
        custodyStatus.querySelector("p")!.textContent = copy[custody.phase][1];
        custodyStatus.querySelector("small")!.textContent =
          `TOTAL YEARS SERVED: ${s.totalYearsServed} · ${custody.phase === "release" ? "DAY RESET CLEARS THIS RECORD" : `${Math.max(0, CUSTODY_DURATIONS[custody.phase] - custody.elapsed).toFixed(1)}s ${this.paused ? " / PAUSED" : ""}`}`;
        const release =
          custodyStatus.querySelector<HTMLButtonElement>("button")!;
        release.hidden = custody.phase !== "release";
        release.disabled = !snapshot.jailExitReachable || this.paused;
      }
      nearest = snapshot.nearest;
      const storySite = snapshot.investigationSite;
      const inHabitat = snapshot.area === "habitat";
      const indoors = inHabitat || snapshot.area === "investigation";
      root.classList.toggle("indoors", indoors);
      root.classList.toggle(
        "in-investigation",
        snapshot.area === "investigation",
      );
      root.classList.toggle("in-elevator", snapshot.riding);
      housingBanner.hidden = !indoors || s.phase !== "playing";
      const floorName =
        snapshot.floor === 0
          ? "GROUND / ARRIVALS"
          : snapshot.floor === 1
            ? "01 / SLEEPING HALL"
            : "03 / BERTH 0806";
      const banner = storySite
        ? `${INVESTIGATION_SITES[storySite].name.toUpperCase()} · ${snapshot.depth.toFixed(snapshot.riding ? 1 : 0)} M BELOW STREET`
        : `HABITAT 09 · ${floorName}`;
      if (housingBanner.textContent !== banner)
        housingBanner.textContent = banner;
      rideIndicator.hidden = !snapshot.riding;
      if (snapshot.riding) {
        rideIndicator.querySelector("label")!.textContent = storySite
          ? "CONTINUITY / DEEP SERVICE LIFT"
          : "HABITAT 09 / PASSENGER LIFT";
        rideIndicator.querySelector("p")!.textContent = storySite
          ? `${snapshot.depth.toFixed(1)} m below street · Cabin doors interlocked`
          : `Cabin elevation ${snapshot.y.toFixed(1)} m · Doors interlocked`;
      }
      streetStatus.hidden =
        snapshot.area !== "street" || Boolean(custody) || this.paused;
      streetStatus.textContent = `${snapshot.security.crowdCount} RESIDENTS · ${snapshot.security.policeCount} COMPLIANCE · ${snapshot.security.droneCount} DRONES / ${snapshot.security.event}`;
      if (
        snapshot.security.notice &&
        snapshot.security.notice.id !== lastNotice
      ) {
        lastNotice = snapshot.security.notice.id;
        ambientUntil = performance.now() + 9000;
        ambient.querySelector("label")!.textContent =
          snapshot.security.notice.source === "drone"
            ? "PUBLIC ADDRESS / CIVIC DRONE"
            : "DISTRICT ACTIVITY / COMPLIANCE";
        ambient.querySelector("p")!.textContent = snapshot.security.notice.text;
      }
      ambient.hidden =
        snapshot.area !== "street" ||
        Boolean(custody) ||
        this.paused ||
        performance.now() > ambientUntil ||
        s.exposureSeconds > 0;
      mapPlayer.setAttribute("cx", String(snapshot.x));
      mapPlayer.setAttribute("cy", String(snapshot.z));
      const nextMapKey = storySite
        ? `story-${storySite}`
        : inHabitat
          ? `indoor-${snapshot.floor}`
          : "street";
      if (mapKey !== nextMapKey) {
        mapKey = nextMapKey;
        const expanded = inHabitat && snapshot.floor === 1;
        mapHeading.innerHTML = storySite
          ? `PRIVATE / OFFLINE <span>${Math.abs(INVESTIGATION_SITES[storySite].depth)} M</span>`
          : inHabitat
            ? `HABITAT 09 <span>${snapshot.floor === 0 ? "G" : `0${snapshot.floor}`}</span>`
            : "SECTOR 09 <span>N ↗</span>";
        mapSvg.setAttribute(
          "viewBox",
          indoors
            ? expanded
              ? "-13 -11 46 22"
              : "-13 -11 26 22"
            : `${DISTRICT_BOUNDS.minX - 1} ${DISTRICT_BOUNDS.minZ - 1} ${DISTRICT_BOUNDS.maxX - DISTRICT_BOUNDS.minX + 2} ${DISTRICT_BOUNDS.maxZ - DISTRICT_BOUNDS.minZ + 2}`,
        );
        mapSvg.querySelector(".interior-map")!.innerHTML = storySite
          ? `<rect x="-12" y="-10" width="24" height="20" fill="#304549" stroke="#8ba39d" stroke-width=".2"/><path d="M0 -8V8M-10 0H10" stroke="#a5b4a7" stroke-width="1.2"/>${snapshot.places.map((place) => `<circle cx="${place.position[0]}" cy="${place.position[2]}" r=".45" fill="#8ec5bf"/>`).join("")}`
          : `<rect x="-12" y="-10" width="${expanded ? 44 : 24}" height="20" fill="#304549" stroke="#8ba39d" stroke-width=".2"/><path d="M0 -8V9M-11 0H${expanded ? 31 : 11}" stroke="#a5b4a7" stroke-width="1.5"/><path d="M-10 -6H-3M3 -6H10M-10 5H-3M4 5H8" stroke="#647e78" stroke-width="4"/><rect x="-1.5" y="-8.5" width="3" height="3" fill="#e6c278"/>${expanded ? '<path d="M13 -6H30M13 -2H30M13 6H30" stroke="#647e78" stroke-width="2"/><path d="M12.3 -7V8M12 -4H31M12 3H31" stroke="#a5b4a7" stroke-width="1"/><circle cx="13" cy="3" r=".6" fill="#e6c278"/>' : '<rect x="4" y="2.5" width="4" height="4" fill="none" stroke="#e6c278" stroke-width=".35"/>'}`;
      }
      const active = s.activeJob;
      const destination = snapshot.destination;
      const storyStep = s.investigation.tracking
        ? nextInvestigationStep(s)
        : undefined;
      const storyGoal = storyStep
        ? INVESTIGATION_ACTIONS[storyStep]
        : undefined;
      mapGoal.setAttribute("visibility", destination ? "visible" : "hidden");
      objectiveButton.dataset.command = handsetButton.dataset.command =
        storyGoal ? "investigation" : "work";
      objectiveButton.setAttribute(
        "aria-label",
        storyGoal ? "Open investigation casefile" : "Open work handset",
      );
      mapGoal.setAttribute("cx", String(destination?.position[0] ?? 0));
      mapGoal.setAttribute("cy", String(destination?.position[2] ?? -7));
      compass.hidden =
        (!active && !storyGoal) ||
        !destination ||
        snapshot.riding ||
        Boolean(custody);
      if (!compass.hidden && destination) {
        const dx = destination.position[0] - snapshot.x;
        const dy = destination.position[1] - snapshot.y;
        const dz = destination.position[2] - snapshot.z;
        const screenX = (dx - dz) / Math.SQRT2;
        const screenY = (dx + dz) / Math.sqrt(6) - dy * Math.sqrt(2 / 3);
        compass.style.transform = `rotate(${(Math.atan2(screenY, screenX) * 180) / Math.PI + 90}deg)`;
        compass.setAttribute("aria-label", `Direction to ${destination.name}`);
        compass.title = destination.name;
      }
      const title = storyGoal
        ? storyGoal.title
        : s.keyFrozen
          ? "Recognition revoked."
          : active
            ? JOBS[active.id].name
            : s.hours === 0
              ? "Return to your room."
              : "Earn the right to stay.";
      if (objectiveTitle.textContent !== title)
        objectiveTitle.textContent = title;
      objectiveLabel.textContent = storyGoal
        ? `UNDER THE COMPACT / ${s.investigation.tokens} GHOST ${s.investigation.tokens === 1 ? "TOKEN" : "TOKENS"}`
        : active
          ? "ACTIVE ASSIGNMENT"
          : s.hours === 0
            ? "SHIFT ALLOCATION EXHAUSTED"
            : s.keyFrozen
              ? "ISSUER ENFORCEMENT"
              : "TODAY'S PRIORITY";
      objectiveDetail.textContent = snapshot.riding
        ? storySite
          ? `Deep lift in transit · ${snapshot.depth.toFixed(1)} m below street.`
          : "Passenger lift in transit."
        : storyGoal || active
          ? destination
            ? `${destination.name} · ${Math.round(Math.hypot(snapshot.x - destination.position[0], snapshot.z - destination.position[2]))} m · E to interact`
            : "Continue after processing. Your records and access are kept."
          : storySite
            ? `Use ${destination?.name ?? "the service exit"} to return to the workday.`
            : s.keyFrozen
              ? "Your funds are frozen. Your capsule on level 03 remains reachable."
              : s.hours === 0
                ? inHabitat
                  ? "Settle at berth 0806 on level 03."
                  : "Enter Habitat 09. Take the lift to level 03."
                : inHabitat
                  ? snapshot.floor === 3
                    ? "Your berth is 0806. Arrange your things. The license is still due."
                    : "Explore the block. Your berth is on level 03."
                  : "40 for housing. 6 for a meal. Visit your capsule in Habitat 09.";
      prompt.hidden =
        !nearest || this.paused || snapshot.riding || Boolean(custody);
      if (
        nearest &&
        prompt.dataset.place !==
          `${snapshot.area}:${storySite ?? snapshot.floor}:${nearest.id}`
      ) {
        prompt.dataset.place = `${snapshot.area}:${storySite ?? snapshot.floor}:${nearest.id}`;
        prompt.innerHTML = `<kbd>E</kbd><div><small>${nearest.sector}</small><strong>${nearest.name}</strong></div><span>INTERACT ↗</span>`;
      }
      exposure.hidden = s.exposureSeconds <= 0 || s.phase !== "playing";
      if (!exposure.hidden) {
        exposure.querySelector("i")!.style.width =
          `${Math.min(100, (s.exposureSeconds / 2) * 100)}%`;
        exposure.querySelector("#exposure-time")!.textContent =
          `${s.exposureSeconds.toFixed(1)} / 2.0 s`;
      }
      if (performance.now() > toastUntil) toast.hidden = true;
    },
  };
}
