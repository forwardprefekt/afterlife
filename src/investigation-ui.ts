import { landmark } from "./content";
import type { Landmark, LandmarkId } from "./content";
import type { GameState } from "./game";
import {
  EVIDENCE,
  INVESTIGATION_ACTIONS,
  INVESTIGATION_ENTRIES,
  INVESTIGATION_PLACES,
  INVESTIGATION_SITES,
  investigationDisabledReason,
  nextInvestigationStep,
  siteAccessReason,
} from "./investigation";
import type {
  EvidenceId,
  InvestigationSite,
  InvestigationStep,
} from "./investigation";

const locks = [
  { site: "villa", step: "breach-villa" },
  { site: "residence", step: "breach-residence" },
  { site: "bunker", step: "breach-depths" },
] as const;
const records: readonly { id: EvidenceId; step: InvestigationStep }[] = [
  { id: "directives", step: "copy-directives" },
  { id: "manifest", step: "copy-manifest" },
  { id: "registry", step: "copy-register" },
  { id: "testimony", step: "hear-survivor" },
  { id: "routing", step: "copy-routing" },
];
const sites = Object.keys(INVESTIGATION_SITES) as InvestigationSite[];
const actions = Object.entries(INVESTIGATION_ACTIONS) as [
  InvestigationStep,
  (typeof INVESTIGATION_ACTIONS)[InvestigationStep],
][];
const contentNotice = `<aside class="story-notice"><strong>Optional mature themes</strong><p>This fictional investigation addresses coercive imprisonment, human trafficking, sexual slavery and forced organ harvesting. Abuse is condemned, off-screen and non-graphic. Survivors are adults, treated with dignity. You may leave this investigation and continue your workday.</p></aside>`;
const completedOutcome = `<div class="story-outcome"><strong>Evidence beyond the Compact.</strong><p>Redacted copies are mirrored beyond one compact’s censorship. Survivor names and the refuge location are withheld. This facility’s outbound transfers are suspended, and three adult witnesses are sheltered in a protected service refuge.</p><p>The wider international trafficking network still exists. You have interrupted one facility and preserved evidence, not freed everyone or ended the system.</p></div>`;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function findPlace(id: LandmarkId): Landmark {
  for (const site of sites) {
    const place = INVESTIGATION_PLACES[site].find((item) => item.id === id);
    if (place) return place;
  }
  return INVESTIGATION_ENTRIES.find((item) => item.id === id) ?? landmark(id);
}

function guidance(step: InvestigationStep): string {
  const action = INVESTIGATION_ACTIONS[step];
  const place = findPlace(action.at);
  const site = sites.find((candidate) =>
    INVESTIGATION_PLACES[candidate].some((item) => item.id === action.at),
  );
  if (!site) {
    return `Street level · ${place.name}. Walk to its interaction point and press E.`;
  }
  const location = INVESTIGATION_SITES[site];
  const depth =
    location.depth < 0 ? ` · ${Math.abs(location.depth)} m below ground` : "";
  if (site === "detention" || site === "routing") {
    return `${location.name}${depth} · ${place.name}. Enter through the bunker and use the physical lift, one floor at a time. Return by the same lift; there is no direct deep exit.`;
  }
  const entrance = findPlace(location.streetEntry!);
  return `${location.name}${depth} · ${place.name}. Use ${entrance.name} on the street, then walk to this point inside. Leave other interiors through their exits first.`;
}

function activityReason(state: GameState): string {
  if (state.phase !== "playing")
    return "Investigation controls are available only during the workday.";
  if (state.custody)
    return "Leave custody after release before continuing the investigation.";
  return "";
}

function button(
  attribute: string,
  value: string,
  label: string,
  reason = "",
): string {
  const reasonId = `story-reason-${attribute}-${value}`;
  return `<button type="button" class="story-button" ${attribute}="${value}"${reason ? ` disabled aria-describedby="${reasonId}"` : ""}>${escape(label)}</button>${reason ? `<p class="story-reason" id="${reasonId}">${escape(reason)}</p>` : ""}`;
}

function stepControl(state: GameState, step: InvestigationStep): string {
  const action = INVESTIGATION_ACTIONS[step];
  const cost = locks.some((lock) => lock.step === step) ? 1 : 0;
  return `<div class="story-action"><p>${escape(action.detail)}</p><p class="story-cost">${cost ? "Consumes one ghost inference token only when access is granted. Access remains unlocked for this day." : "No ghost tokens, issuer credits or work hours spent."}</p>${button("data-story-step", step, action.label, investigationDisabledReason(state, step))}</div>`;
}

function collectedRecord(id: EvidenceId): string {
  const evidence = EVIDENCE[id];
  return `<article class="story-record"><span class="story-label">COLLECTED RECORD</span><h3>${escape(evidence.title)}</h3><p class="story-source">${escape(evidence.source)}</p><p class="story-record-text">${escape(evidence.text)}</p></article>`;
}

function tokenAccount(state: GameState): string {
  const story = state.investigation;
  const spent = locks.filter((lock) => story.unlocked[lock.site]).length;
  return `<section class="story-tokens" aria-label="Ghost inference token accounting"><span class="story-label">OFFLINE GHOST INFERENCE</span><div class="story-token-balance"><strong>${story.tokens}</strong><span>tokens available<br>Not issuer AC</span></div><dl class="story-account"><div><dt>One-time grant</dt><dd>${story.issued ? "3 received" : "3 awaiting broker"}</dd></div><div><dt>Consumed on locks</dt><dd>${spent}</dd></div><div><dt>Remaining</dt><dd>${story.tokens}</dd></div></dl><ul class="story-locks">${locks.map((lock) => `<li><span>${escape(INVESTIGATION_SITES[lock.site].name)}</span><strong>${story.unlocked[lock.site] ? "Unlocked · paid once" : "Locked · 1 token"}</strong></li>`).join("")}</ul><p>Exactly three tokens, for three locks. No refills. Reentry is free. Ghost tokens are offline access tools, not money; they never enter the government ledger. A frozen issuer key does not disable them after custody release.</p></section>`;
}

export function renderInvestigationJournal(state: GameState): string {
  const story = state.investigation;
  const next = nextInvestigationStep(state);
  const objective = next ? INVESTIGATION_ACTIONS[next] : undefined;
  const reason = next ? investigationDisabledReason(state, next) : "";
  const tracking =
    story.accepted && !story.exposed
      ? `${button("data-story-track", String(!story.tracking), story.tracking ? "Stop tracking investigation" : "Track investigation", activityReason(state))}<p class="story-guidance">${story.tracking ? "Tracking on. The district marker points to the next reachable door, lift or interaction." : "Tracking off. Your records and unlocked access are kept; the workday destination is shown instead."}</p>`
      : "";
  return `<div class="story-journal"><div class="app-heading"><h2>Under the Compact</h2><p>Optional investigation / private field journal</p></div>${contentNotice}<section class="story-objective"><span class="story-label">${story.exposed ? "INVESTIGATION COMPLETE" : "CURRENT OBJECTIVE"}</span>${objective && next ? `<h3>${escape(objective.title)}</h3><p>${escape(objective.detail)}</p><p class="story-guidance">${escape(guidance(next))}</p>${reason ? `<p class="story-reason">${escape(reason)}</p>` : ""}<p class="story-guidance">Actions require your physical presence. This journal cannot copy records, open doors or transmit remotely.</p>` : completedOutcome}${tracking}</section>${tokenAccount(state)}<section class="story-evidence" aria-label="Investigation records"><h3>Records · ${story.evidence.length} / ${records.length}</h3><p>Collected records are readable below. Uncollected contents remain unknown.</p>${records.map(({ id }) => (story.evidence.includes(id) ? collectedRecord(id) : `<article class="story-record story-missing"><span class="story-label">NOT COLLECTED / CONTENTS UNKNOWN</span><h3>${escape(EVIDENCE[id].title)}</h3></article>`)).join("")}</section><p class="story-footnote">Investigation actions spend no work hours or issuer credits. Housing and meals still need to be settled. Restarting or reloading clears this journal, token grant and unlocked access.</p></div>`;
}

export function renderInvestigationActions(
  place: Landmark,
  state: GameState,
  site?: InvestigationSite,
): string | undefined {
  const story = state.investigation;
  let content: string;
  if (place.id === "underground-contact") {
    content = `<h3>Under the Compact / a separate offer</h3>${story.accepted ? "<p>Mara’s lead is saved in your private journal. This investigation is separate from the paid relay job.</p>" : `${contentNotice}${stepControl(state, "accept-lead")}`}`;
  } else if (place.id === "market-entry") {
    content = `<p>Enter the exchange beneath the tram. Entry and return visits are free.</p>${button("data-story-enter", "market", `Enter ${INVESTIGATION_SITES.market.name} · 0 tokens`, activityReason(state) || siteAccessReason(story, "market"))}`;
  } else {
    const lock = locks.find(
      (candidate) => INVESTIGATION_ACTIONS[candidate.step].at === place.id,
    );
    if (lock) {
      content = story.unlocked[lock.site]
        ? `<p class="story-access">Access acquired. This lock has already consumed its token. Reopening it never costs another.</p>${button("data-story-enter", lock.site, `Enter ${INVESTIGATION_SITES[lock.site].name} · 0 tokens`, activityReason(state) || siteAccessReason(story, lock.site))}`
        : stepControl(state, lock.step);
    } else if (
      sites.some(
        (candidate) => INVESTIGATION_SITES[candidate].exit === place.id,
      )
    ) {
      content = `<p>Return to this entrance on the street. Your records and unlocked doors are retained.</p>${button("data-story-exit", "true", "Return to street · 0 tokens", activityReason(state))}`;
    } else if (place.id === "deep-lift") {
      const destinations: readonly InvestigationSite[] =
        site === "bunker"
          ? ["detention"]
          : site === "detention"
            ? ["bunker", "routing"]
            : site === "routing"
              ? ["detention"]
              : [];
      content = destinations.length
        ? `<p class="story-guidance">Current floor: ${escape(INVESTIGATION_SITES[site!].name)} · ${Math.abs(INVESTIGATION_SITES[site!].depth)} m below ground.</p><div class="story-lift">${destinations.map((destination) => button("data-story-ride", destination, `${INVESTIGATION_SITES[destination].name} · ${Math.abs(INVESTIGATION_SITES[destination].depth)} m · 0 tokens`, activityReason(state) || siteAccessReason(story, destination))).join("")}</div><p class="story-guidance">The lift stops at adjacent floors only. Reach the surface via detention, then the bunker lobby. Travel pauses while a menu is open; walking is unavailable in transit.</p>`
        : `<p class="story-reason">Use this lift from the bunker lobby, detention floor or routing floor.</p>`;
    } else {
      const action = actions.find(
        ([, definition]) => definition.at === place.id,
      );
      if (!action) return undefined;
      const [step] = action;
      const record = records.find((item) => item.step === step);
      content = `${step === "claim-tokens" ? tokenAccount(state) : ""}${stepControl(state, step)}${record && story.evidence.includes(record.id) ? collectedRecord(record.id) : ""}${step === "open-refuge" && story.refugeOpen ? '<p class="story-access">The local refuge route is open. Three adult survivors can reach the protected service refuge; this facility’s outbound transfers are interrupted.</p>' : ""}${step === "broadcast" && story.exposed ? completedOutcome : ""}`;
    }
  }
  return `<section class="story-actions" aria-label="Under the Compact actions">${content}${button("data-command", "investigation", "Read investigation journal")}</section>`;
}

export function renderInvestigationEpilogue(state: GameState): string {
  const story = state.investigation;
  if (!story.accepted) return "";
  const next = nextInvestigationStep(state);
  return `<section class="story-epilogue"><span class="story-label">UNDER THE COMPACT / ${story.exposed ? "EXPOSED" : "UNFINISHED"}</span><h3>${story.exposed ? "A protected record survives." : "The investigation ends with this day."}</h3>${story.exposed ? completedOutcome : `<p>${story.refugeOpen ? "Three adult witnesses have a protected local refuge, and this facility’s outbound transfers are interrupted. The evidence has not been mirrored beyond the Compact." : "No refuge route was opened and no evidence was transmitted. Collected records alone did not interrupt the facility."}</p><p>${story.evidence.length} of ${records.length} records collected.${next ? ` Unfinished objective: ${escape(INVESTIGATION_ACTIONS[next].title)}.` : ""}</p>`}<p class="story-footnote">This outcome does not change your housing settlement or restore issuer recognition. Restarting begins a new day with no investigation progress.</p></section>`;
}
