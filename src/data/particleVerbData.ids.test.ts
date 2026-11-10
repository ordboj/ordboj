import { describe, expect, it } from 'vitest';
import { PARTICLE_VERB_DATA } from './particleVerbData';
import { getVerifiedParticleVerbs } from '@/lib/particleVerbs';

// Frozen snapshot of every pv: entry on origin/main before ORD-123 (the
// spatial-particle sense split): [id, particle, acceptedParticles], in
// order. Ids are localStorage keys for learners' progress, so none may be
// renamed, removed or reordered, and the graded answers of an existing id
// must not change silently. Updating this list is a deliberate, reviewed
// act, never a side effect. Literal on purpose: do not derive at test time.
type Row = readonly [id: string, particle: string, acceptedParticles: readonly string[]];

const MAIN_SNAPSHOT: readonly Row[] = [
  ['pv:ga-ut', 'ut', ['ut']],
  ['pv:ga-in', 'in', ['in']],
  ['pv:ga-upp', 'upp', ['upp']],
  ['pv:ga-ner', 'ner', ['ner', 'ned']],
  ['pv:se-ut', 'ut', ['ut']],
  ['pv:komma-in', 'in', ['in']],
  ['pv:komma-fram', 'fram', ['fram']],
  ['pv:komma-ihag', 'ihåg', ['ihåg']],
  ['pv:komma-tillbaka', 'tillbaka', ['tillbaka']],
  ['pv:ta-med', 'med', ['med']],
  ['pv:ta-ut', 'ut', ['ut']],
  ['pv:tala-om', 'om', ['om']],
  ['pv:vara-med', 'med', ['med']],
  ['pv:tycka-om', 'om', ['om']],
  ['pv:ge-upp', 'upp', ['upp']],
  ['pv:komma-ut', 'ut', ['ut']],
  ['pv:kanna-igen', 'igen', ['igen']],
  ['pv:halla-pa', 'på', ['på']],
  ['pv:halla-med', 'med', ['med']],
  ['pv:ta-upp', 'upp', ['upp']],
  ['pv:ta-bort', 'bort', ['bort']],
  ['pv:ta-emot', 'emot', ['emot']],
  ['pv:ta-fram', 'fram', ['fram']],
  ['pv:gora-om', 'om', ['om']],
  ['pv:ga-over', 'över', ['över']],
  ['pv:skriva-ner', 'ner', ['ner', 'ned', 'upp']],
  ['pv:skriva-ut', 'ut', ['ut']],
  ['pv:tanka-om', 'om', ['om']],
  ['pv:ha-kvar', 'kvar', ['kvar']],
  ['pv:bli-over', 'över', ['över']],
  ['pv:ga-sonder', 'sönder', ['sönder']],
  ['pv:ge-ut', 'ut', ['ut']],
  ['pv:sta-ut', 'ut', ['ut']],
  ['pv:saga-till', 'till', ['till']],
  ['pv:tanka-efter', 'efter', ['efter']],
  ['pv:kanna-till', 'till', ['till']],
  ['pv:ta-slut', 'slut', ['slut']],
  ['pv:borja-om', 'om', ['om']],
  ['pv:visa-upp', 'upp', ['upp']],
  ['pv:vanda-om', 'om', ['om']],
  ['pv:ga-igenom', 'igenom', ['igenom']],
  ['pv:komma-pa', 'på', ['på']],
  ['pv:hora-av-sig', 'av', ['av']],
  ['pv:ge-sig-av', 'av', ['av']],
  ['pv:stanga-av', 'av', ['av']],
  ['pv:satta-pa', 'på', ['på']],
  ['pv:stiga-upp', 'upp', ['upp']],
  ['pv:halsa-pa', 'på', ['på']],
  ['pv:bygga-ut', 'ut', ['ut']],
  ['pv:stalla-in', 'in', ['in']],
  ['pv:veta-om', 'om', ['om']],
  ['pv:satta-upp', 'upp', ['upp']],
  ['pv:komma-igen', 'igen', ['igen']],
  ['pv:ta-in', 'in', ['in']],
  ['pv:lagga-ner', 'ner', ['ner', 'ned']],
  ['pv:stalla-upp', 'upp', ['upp']],
  ['pv:se-om', 'om', ['om']],
  ['pv:satta-in', 'in', ['in']],
  ['pv:lagga-in', 'in', ['in']],
  ['pv:satta-ut', 'ut', ['ut']],
  ['pv:bli-av', 'av', ['av']],
  ['pv:ta-om', 'om', ['om']],
  ['pv:lagga-om', 'om', ['om']],
  ['pv:gora-upp', 'upp', ['upp']],
  ['pv:komma-upp', 'upp', ['upp']],
  ['pv:gora-slut', 'slut', ['slut']],
  ['pv:lagga-upp', 'upp', ['upp']],
  ['pv:bli-kvar', 'kvar', ['kvar']],
  ['pv:ga-till', 'till', ['till']],
  ['pv:ta-ner', 'ner', ['ner', 'ned']],
  ['pv:se-fram', 'fram', ['fram']],
  ['pv:ga-miste', 'miste', ['miste']],
  ['pv:lagga-till', 'till', ['till']],
  ['pv:komma-till', 'till', ['till']],
  ['pv:ga-med', 'med', ['med']],
  ['pv:lagga-ut', 'ut', ['ut']],
  ['pv:riva-sonder', 'sönder', ['sönder']],
  ['pv:halla-upp', 'upp', ['upp']],
  ['pv:lagga-av', 'av', ['av']],
  ['pv:ta-till', 'till', ['till']],
  ['pv:ga-igen', 'igen', ['igen']],
  ['pv:lasa-pa', 'på', ['på']],
  ['pv:stalla-ut', 'ut', ['ut']],
  ['pv:ta-av', 'av', ['av']],
  ['pv:halla-kvar', 'kvar', ['kvar']],
  ['pv:soka-upp', 'upp', ['upp']],
  ['pv:bygga-om', 'om', ['om']],
  ['pv:stalla-till', 'till', ['till']],
  ['pv:halla-till', 'till', ['till']],
  ['pv:komma-hem', 'hem', ['hem']],
  ['pv:ga-hem', 'hem', ['hem']],
  ['pv:ta-hem', 'hem', ['hem']],
  ['pv:satta-igang', 'igång', ['igång']],
  ['pv:ga-at', 'åt', ['åt']],
  ['pv:komma-igang', 'igång', ['igång']],
  ['pv:satta-ihop', 'ihop', ['ihop']],
  ['pv:satta-samman', 'samman', ['samman']],
  ['pv:satta-fast', 'fast', ['fast']],
  ['pv:gora-at', 'åt', ['åt']],
  ['pv:halla-undan', 'undan', ['undan']],
  ['pv:ga-an', 'an', ['an']],
  ['pv:hora-hemma', 'hemma', ['hemma']],
  ['pv:komma-undan', 'undan', ['undan']],
  ['pv:ta-fast', 'fast', ['fast']],
  ['pv:ta-itu', 'itu', ['itu']],
  ['pv:halla-tillbaka', 'tillbaka', ['tillbaka']],
  ['pv:lasa-in', 'in', ['in']],
  ['pv:saga-upp', 'upp', ['upp']],
  ['pv:sta-upp', 'upp', ['upp']],
  ['pv:ga-bort', 'bort', ['bort']],
  ['pv:se-ner', 'ner', ['ner', 'ned']],
  ['pv:vara-ihop', 'ihop', ['ihop']],
  ['pv:ge-bort', 'bort', ['bort']],
  ['pv:hora-till', 'till', ['till']],
  ['pv:ta-efter', 'efter', ['efter']],
  ['pv:fa-ihop', 'ihop', ['ihop']],
  ['pv:ge-tillbaka', 'tillbaka', ['tillbaka']],
  ['pv:halla-fast', 'fast', ['fast']],
  ['pv:komma-bort', 'bort', ['bort']],
  ['pv:sta-till', 'till', ['till']],
  ['pv:ha-pa-sig', 'på', ['på']],
  ['pv:ta-pa-sig', 'på', ['på']],
  ['pv:ta-av-sig', 'av', ['av']],
  ['pv:stiga-av', 'av', ['av']],
  ['pv:se-upp', 'upp', ['upp']],
  ['pv:dra-in', 'in', ['in']],
  ['pv:do-ut', 'ut', ['ut']],
  ['pv:lamna-in', 'in', ['in']],
  ['pv:ata-upp', 'upp', ['upp']],
  ['pv:kora-hem', 'hem', ['hem']],
  ['pv:glomma-bort', 'bort', ['bort']],
  ['pv:slappa-ut', 'ut', ['ut']],
  ['pv:varma-upp', 'upp', ['upp']],
  ['pv:hanga-upp', 'upp', ['upp']],
  ['pv:kora-in', 'in', ['in']],
  ['pv:lara-in', 'in', ['in']],
  ['pv:dra-ut', 'ut', ['ut']],
  ['pv:bryta-upp', 'upp', ['upp']],
  ['pv:hoppa-over', 'över', ['över']],
  ['pv:bjuda-in', 'in', ['in']],
  ['pv:aka-fast', 'fast', ['fast']],
  ['pv:peka-ut', 'ut', ['ut']],
  ['pv:reda-ut', 'ut', ['ut']],
  ['pv:hanga-med', 'med', ['med']],
  ['pv:rakna-ut', 'ut', ['ut']],
  ['pv:lyfta-fram', 'fram', ['fram']],
  ['pv:hanga-ihop', 'ihop', ['ihop']],
  ['pv:passa-ihop', 'ihop', ['ihop']],
  ['pv:foda-upp', 'upp', ['upp']],
  ['pv:ropa-upp', 'upp', ['upp']],
  ['pv:falla-ner', 'ner', ['ner', 'ned']],
  ['pv:dela-upp', 'upp', ['upp']],
  ['pv:reta-upp', 'upp', ['upp']],
  ['pv:spela-upp', 'upp', ['upp']],
  ['pv:andas-in', 'in', ['in']],
  ['pv:sitta-fast', 'fast', ['fast']],
  ['pv:kora-pa', 'på', ['på']],
  ['pv:hitta-pa', 'på', ['på']],
  ['pv:blanda-ihop', 'ihop', ['ihop']],
  ['pv:skicka-ut', 'ut', ['ut']],
  ['pv:passa-in', 'in', ['in']],
  ['pv:fara-ut', 'ut', ['ut']],
  ['pv:titta-in', 'in', ['in']],
  ['pv:blanda-in', 'in', ['in']],
  ['pv:hyra-ut', 'ut', ['ut']],
  ['pv:kolla-upp', 'upp', ['upp']],
  ['pv:flytta-ut', 'ut', ['ut']],
  ['pv:stoppa-ner', 'ner', ['ner', 'ned', 'in']],
  ['pv:valja-ut', 'ut', ['ut']],
  ['pv:spara-ihop', 'ihop', ['ihop']],
  ['pv:fora-fram', 'fram', ['fram']],
  ['pv:resa-bort', 'bort', ['bort']],
  ['pv:skjuta-upp', 'upp', ['upp']],
  ['pv:andas-ut', 'ut', ['ut']],
  ['pv:flytta-bort', 'bort', ['bort']],
  ['pv:ringa-upp', 'upp', ['upp']],
  ['pv:trycka-ner', 'ner', ['ner', 'ned']],
  ['pv:slosa-bort', 'bort', ['bort']],
  ['pv:trana-upp', 'upp', ['upp']],
  ['pv:plocka-ihop', 'ihop', ['ihop']],
  ['pv:dricka-ur', 'ur', ['ur']],
  ['pv:rycka-in', 'in', ['in']],
  ['pv:blasa-upp', 'upp', ['upp']],
  ['pv:jaga-upp', 'upp', ['upp']],
  ['pv:kasta-bort', 'bort', ['bort']],
  ['pv:sla-ihjal', 'ihjäl', ['ihjäl']],
  ['pv:sla-in', 'in', ['in']],
  ['pv:sla-sonder', 'sönder', ['sönder']],
  ['pv:dela-ut', 'ut', ['ut']],
  ['pv:dyka-upp', 'upp', ['upp']],
  ['pv:hjalpa-till', 'till', ['till']],
  ['pv:lana-ut', 'ut', ['ut']],
  ['pv:spela-in', 'in', ['in']],
  ['pv:sla-ut', 'ut', ['ut']],
  ['pv:koppla-av', 'av', ['av']],
  ['pv:sla-upp', 'upp', ['upp']],
  ['pv:lamna-tillbaka', 'tillbaka', ['tillbaka']],
  ['pv:sla-pa', 'på', ['på']],
  ['pv:sla-av', 'av', ['av']],
  ['pv:folja-med', 'med', ['med']],
  ['pv:flytta-in', 'in', ['in']],
  ['pv:checka-in', 'in', ['in']],
  ['pv:torka-av', 'av', ['av']],
  ['pv:stada-upp', 'upp', ['upp']],
  ['pv:fylla-i', 'i', ['i']],
  ['pv:packa-in', 'in', ['in']],
  ['pv:skjuta-in', 'in', ['in']],
  ['pv:hinna-med', 'med', ['med']],
  ['pv:klara-av', 'av', ['av']],
  ['pv:samla-ihop', 'ihop', ['ihop']],
  ['pv:skynda-pa', 'på', ['på']],
  ['pv:rusa-ut', 'ut', ['ut']],
  ['pv:bryta-ut', 'ut', ['ut']],
  ['pv:grava-ner', 'ner', ['ner', 'ned']],
  ['pv:sitta-ner', 'ner', ['ner', 'ned']],
  ['pv:gomma-undan', 'undan', ['undan']],
  ['pv:hugga-in', 'in', ['in']],
  ['pv:skramma-bort', 'bort', ['bort', 'iväg']],
  ['pv:skicka-in', 'in', ['in']],
  ['pv:klattra-upp', 'upp', ['upp']],
  ['pv:kasta-tillbaka', 'tillbaka', ['tillbaka']],
  ['pv:plocka-undan', 'undan', ['undan']],
  ['pv:koppla-ihop', 'ihop', ['ihop']],
  ['pv:krypa-upp', 'upp', ['upp']],
  ['pv:stromma-in', 'in', ['in']],
  ['pv:vila-ut', 'ut', ['ut']],
  ['pv:kasta-in', 'in', ['in']],
  ['pv:dra-upp', 'upp', ['upp']],
  ['pv:byta-ut', 'ut', ['ut']],
  ['pv:rakna-bort', 'bort', ['bort']],
  ['pv:plocka-upp', 'upp', ['upp']],
  ['pv:stoppa-in', 'in', ['in']],
  ['pv:falla-ihop', 'ihop', ['ihop']],
  ['pv:sla-ner', 'ner', ['ner', 'ned']],
  ['pv:kla-ut-sig', 'ut', ['ut']],
  ['pv:slappa-in', 'in', ['in']],
  ['pv:springa-ut', 'ut', ['ut']],
  ['pv:springa-fram', 'fram', ['fram']],
  ['pv:falla-upp', 'upp', ['upp']],
  ['pv:kora-om', 'om', ['om']],
  ['pv:lara-ut', 'ut', ['ut']],
  ['pv:sticka-upp', 'upp', ['upp']],
  ['pv:suga-upp', 'upp', ['upp']],
  ['pv:hanga-samman', 'samman', ['samman']],
  ['pv:laga-till', 'till', ['till']],
  ['pv:plocka-fram', 'fram', ['fram']],
  ['pv:stryka-over', 'över', ['över']],
  ['pv:kasta-ut', 'ut', ['ut']],
  ['pv:byta-om', 'om', ['om']],
  ['pv:hugga-ner', 'ner', ['ner', 'ned']],
  ['pv:ha-med-sig', 'med', ['med']],
  ['pv:kla-pa-sig', 'på', ['på']],
  ['pv:kla-av-sig', 'av', ['av']],
  ['pv:satta-sig-ner', 'ner', ['ner', 'ned']],
  ['pv:stiga-pa', 'på', ['på']],
  ['pv:fylla-pa', 'på', ['på']],
  ['pv:lagga-pa', 'på', ['på']],
  ['pv:ga-av', 'av', ['av', 'sönder']],
  ['pv:plocka-bort', 'bort', ['bort']],
  ['pv:stalla-fram', 'fram', ['fram']],
  ['pv:packa-ihop', 'ihop', ['ihop']],
  ['pv:checka-ut', 'ut', ['ut']],
  ['pv:skicka-tillbaka', 'tillbaka', ['tillbaka']],
  ['pv:komma-ner', 'ner', ['ner', 'ned']],
  ['pv:ga-ivag', 'iväg', ['iväg']],
  ['pv:aka-bort', 'bort', ['bort']],
  ['pv:hoppa-upp', 'upp', ['upp']],
  ['pv:fa-tillbaka', 'tillbaka', ['tillbaka']],
  ['pv:slappna-av', 'av', ['av']],
  ['pv:vika-ihop', 'ihop', ['ihop']],
  ['pv:badda-in', 'in', ['in']],
  ['pv:piffa-upp', 'upp', ['upp', 'till']],
  ['pv:traka-ut', 'ut', ['ut']],
  ['pv:laasa-in', 'in', ['in']],
];

const MAIN_COUNT = 274;

// The 11 entries ORD-123 appended after the frozen 274 (9 from the first
// batch, then satta-in-montera and plocka-bort-lista), in data order. Pinned
// literally so an accidental removal, rename or reorder is loud.
const APPENDED_IDS: readonly string[] = [
  'pv:ga-ut-lamna',
  'pv:ga-upp-stiga',
  'pv:ga-ner-minska',
  'pv:komma-in-antagning',
  'pv:ta-ut-uttag',
  'pv:ta-bort-radera',
  'pv:satta-upp-pjas',
  'pv:satta-ut-medicin',
  'pv:komma-upp-amne',
  'pv:satta-in-montera',
  'pv:plocka-bort-lista',
];
const MAIN_IDS = MAIN_SNAPSHOT.map(([id]) => id);

describe('particle verb id stability (ORD-123 pin)', () => {
  it('snapshot itself is sane: 274 unique ids', () => {
    expect(MAIN_SNAPSHOT).toHaveLength(MAIN_COUNT);
    expect(new Set(MAIN_IDS).size).toBe(MAIN_COUNT);
  });

  it('every id that shipped on main still exists', () => {
    const current = new Set(PARTICLE_VERB_DATA.map((entry) => entry.id));
    expect(MAIN_IDS.filter((id) => !current.has(id))).toEqual([]);
  });

  it('the first 274 entries keep the same ids in the same order', () => {
    expect(PARTICLE_VERB_DATA.slice(0, MAIN_COUNT).map((entry) => entry.id)).toEqual(MAIN_IDS);
  });

  it('new entries are appended after the pre-existing ones', () => {
    const appended = PARTICLE_VERB_DATA.slice(MAIN_COUNT).map((entry) => entry.id);
    expect(appended.filter((id) => MAIN_IDS.includes(id))).toEqual([]);
    expect(PARTICLE_VERB_DATA.length).toBeGreaterThan(MAIN_COUNT);
  });

  it('exactly the 11 pinned ORD-123 entries are appended, in order', () => {
    expect(APPENDED_IDS).toHaveLength(11);
    expect(new Set(APPENDED_IDS).size).toBe(11);
    expect(PARTICLE_VERB_DATA).toHaveLength(MAIN_COUNT + APPENDED_IDS.length);
    expect(PARTICLE_VERB_DATA.slice(MAIN_COUNT).map((entry) => entry.id)).toEqual(APPENDED_IDS);
  });

  it('every pinned appended entry is verified and served by getVerifiedParticleVerbs', () => {
    const shipped = new Set(getVerifiedParticleVerbs().map((entry) => entry.id));
    for (const id of APPENDED_IDS) {
      const entry = PARTICLE_VERB_DATA.find((candidate) => candidate.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.verified, id).toBe(true);
      expect(shipped.has(id), id).toBe(true);
    }
  });

  it('all ids are unique and carry the pv: prefix', () => {
    const ids = PARTICLE_VERB_DATA.map((entry) => entry.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids.filter((id) => !id.startsWith('pv:'))).toEqual([]);
  });

  it('every new entry is verified, or is withheld from the provider consistent with its flag', () => {
    const shipped = new Set(getVerifiedParticleVerbs().map((entry) => entry.id));
    const added = PARTICLE_VERB_DATA.slice(MAIN_COUNT);
    for (const entry of added) {
      expect(shipped.has(entry.id), entry.id).toBe(entry.verified);
      if (!entry.verified) {
        expect(entry.unverifiedReason, entry.id).toBeTruthy();
      }
    }
    // The split is meant to ship: guard against a silent all-unverified batch.
    expect(added.some((entry) => entry.verified)).toBe(true);
  });

  it('no pre-existing entry changed its particle or acceptedParticles', () => {
    const byId = new Map(PARTICLE_VERB_DATA.map((entry) => [entry.id, entry]));
    for (const [id, particle, accepted] of MAIN_SNAPSHOT) {
      const entry = byId.get(id);
      expect(entry, id).toBeDefined();
      expect({ id, particle: entry?.particle, accepted: entry?.acceptedParticles }).toEqual({
        id,
        particle,
        accepted,
      });
    }
  });
});

describe('primary sense of split particle verbs (ORD-123)', () => {
  it('for every base+particle shared by verified entries, the first one is a pre-existing entry', () => {
    const mainIds = new Set(MAIN_IDS);
    const groups = new Map<string, string[]>();
    for (const entry of getVerifiedParticleVerbs()) {
      const key = `${entry.baseInfinitive}|${entry.particle}`;
      groups.set(key, [...(groups.get(key) ?? []), entry.id]);
    }
    const shared = [...groups.entries()].filter(([, ids]) => ids.length > 1);
    // Guard against a vacuous pass: the split really produced shared pairs.
    expect(shared.length).toBeGreaterThan(0);
    const appendedPrimaries = shared.filter(([, ids]) => !mainIds.has(ids[0]!)).map(([key]) => key);
    expect(appendedPrimaries).toEqual([]);
  });
});
