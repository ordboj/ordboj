import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ParticleVerbCard } from '@/components/ParticleVerbCard';
import { particleItemId } from '@/lib/itemIds';
import {
  getAcceptedParticles,
  getAcceptedRecallAnswers,
  getParticleCoreSense,
  getParticleGlyph,
  getVerifiedParticleVerbs,
  renderLemma,
} from '@/lib/particleVerbs';
import type { ParticleVerbData } from '@/data/particleVerbData';
import type { ParticleSittingCard } from '@/lib/particleQueue';

// ORD-121: the motion glyph appears ONLY in the feedback block, at the top of
// the lemma card, and only when getParticleGlyph allows it
// (docs/learning/2026-11-10-particle-motion-glyphs.md rules 1-5).

const originalMatchMedia = window.matchMedia;

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

function realEntry(id: string): ParticleVerbData {
  return getVerifiedParticleVerbs().find((candidate) => candidate.id === id)!;
}

function cardFor(entry: ParticleVerbData, kind: ParticleSittingCard['kind']): ParticleSittingCard {
  return {
    kind,
    entry,
    itemId: kind === 'introduction' ? null : particleItemId(entry.id, kind),
    countsTowardGoal: true,
  };
}

// pv:ga-in with two excluded particles on every frame so a discrimination
// card is reachable (no real flagged entry authors excludedParticles).
function discriminationGaIn(overrides: Partial<ParticleVerbData> = {}): ParticleVerbData {
  const base = realEntry('pv:ga-in');
  return {
    ...base,
    ...overrides,
    examples: base.examples.map((example) => ({
      ...example,
      excludedParticles: ['ut', 'upp'],
    })),
  };
}

const INTRODUCED = new Set(['in', 'ut', 'upp']);
const GLYPH_SELECTOR = '.particle-glyph-mover';
const REPLAY = /Replay movement/;

function glyphMovers(container: HTMLElement) {
  return container.querySelectorAll(GLYPH_SELECTOR);
}

function expectNoGlyph(container: HTMLElement) {
  expect(screen.queryByRole('button', { name: REPLAY })).toBeNull();
  expect(glyphMovers(container)).toHaveLength(0);
}

function findParagraph(container: HTMLElement, text: string): HTMLElement {
  // The graded panel's lemma is the card's level-2 heading (ORD-128): located
  // by role, so it may be a <p role="heading"> or a real <h2>.
  const found = within(container)
    .getAllByRole('heading', { level: 2 })
    .find((candidate) => candidate.textContent === text);
  if (!found) throw new Error(`no level-2 heading with exact text "${text}"`);
  return found;
}

async function typeAnswer(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.type(screen.getByRole('textbox'), value);
  // An exact match auto-submits; click Check Answer only if it did not.
  const check = screen.queryByRole('button', { name: 'Check Answer' });
  if (check) await user.click(check);
}

describe('no glyph before grading (flagged pv:ga-in)', () => {
  it('cloze prompt', () => {
    const entry = realEntry('pv:ga-in');
    expect(getParticleGlyph(entry)).toBe('in');
    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    expect(screen.getByText('Fill in the missing particle')).toBeInTheDocument();
    expectNoGlyph(container);
  });

  it('recall prompt', () => {
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'recall')} />);
    expect(screen.getByText('Write the Swedish particle verb')).toBeInTheDocument();
    expectNoGlyph(container);
  });

  it('discrimination prompt', () => {
    const { container } = renderWithProviders(
      <ParticleVerbCard
        card={cardFor(discriminationGaIn(), 'cloze')}
        repetitions={3}
        introducedParticles={INTRODUCED}
      />,
    );
    expect(screen.getByText('Choose the correct particle verb')).toBeInTheDocument();
    expectNoGlyph(container);
  });

  it('is still absent under reduced motion (no aria-hidden stand-in either)', () => {
    mockReducedMotion(true);
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    expectNoGlyph(container);
  });
});

describe('glyph on the introduction card (human decision G)', () => {
  it('flagged entry: exactly one glyph, above the lemma heading, sense line glyph-free', () => {
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(entry, 'introduction')} />,
    );
    expect(screen.getByText('A new particle verb')).toBeInTheDocument();
    const replay = screen.getByRole('button', { name: 'Replay movement: in' });
    expect(screen.getAllByRole('button', { name: REPLAY })).toHaveLength(1);
    expect(glyphMovers(container)).toHaveLength(1);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe(renderLemma(entry));
    expect(replay.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sense = screen.getByText(/often movement inwards, or entry/);
    expect(sense.querySelector('svg')).toBeNull();
    expect(within(sense).queryByRole('button')).toBeNull();
    expect(replay).toHaveClass('size-11');
  });

  it('unflagged entry: no glyph, sense line still present', () => {
    const entry = realEntry('pv:tycka-om');
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(entry, 'introduction')} />,
    );
    expectNoGlyph(container);
    expect(
      screen.getByText(new RegExp(getParticleCoreSense('om')!.slice(0, 20))),
    ).toBeInTheDocument();
  });

  it('reduced motion: aria-hidden rest frame, no button', () => {
    mockReducedMotion(true);
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(entry, 'introduction')} />,
    );
    expect(screen.queryByRole('button', { name: REPLAY })).toBeNull();
    expect(glyphMovers(container)).toHaveLength(1);
    expect(container.querySelector(`[aria-hidden="true"] ${GLYPH_SELECTOR}`)).not.toBeNull();
  });

  it('tapping the glyph grades nothing and Got it still works', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const onAcknowledge = vi.fn();
    const entry = realEntry('pv:ga-in');
    renderWithProviders(
      <ParticleVerbCard
        card={cardFor(entry, 'introduction')}
        onAnswer={onAnswer}
        onAcknowledge={onAcknowledge}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Replay movement: in' }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onAcknowledge).not.toHaveBeenCalled();
    expect(screen.getByText('A new particle verb')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('glyph after grading', () => {
  it('typed correct cloze: exactly one glyph, sense line as plain text, lemma heading', async () => {
    const user = userEvent.setup();
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    await typeAnswer(user, getAcceptedParticles(entry)[0]!);

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: REPLAY })).toHaveLength(1);
    expect(glyphMovers(container)).toHaveLength(1);
    expect(screen.getByText(/often movement inwards, or entry/)).toBeInTheDocument();
    expect(findParagraph(container, renderLemma(entry))).toBeInTheDocument();
  });

  it('typed wrong cloze: the correct entry glyph, never the typed answer', async () => {
    const user = userEvent.setup();
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    await typeAnswer(user, 'ut');

    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: REPLAY })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Replay movement: in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay movement: ut' })).toBeNull();
    expect(glyphMovers(container)).toHaveLength(1);
    expect(screen.getByText(/often movement inwards, or entry/)).toBeInTheDocument();
    expect(findParagraph(container, renderLemma(entry))).toBeInTheDocument();
  });

  it('typed correct and wrong recall card', async () => {
    const entry = realEntry('pv:ga-in');
    const user = userEvent.setup();
    const first = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'recall')} />);
    await typeAnswer(user, getAcceptedRecallAnswers(entry)[0]!);
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Replay movement: in' })).toHaveLength(1);
    expect(glyphMovers(first.container)).toHaveLength(1);
    first.unmount();

    const second = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'recall')} />);
    await typeAnswer(user, 'gå ut');
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Replay movement: in' })).toHaveLength(1);
    expect(glyphMovers(second.container)).toHaveLength(1);
    expect(screen.getByText(/often movement inwards, or entry/)).toBeInTheDocument();
  });

  it('discrimination, correct tap: one glyph, sense line, lemma', async () => {
    const user = userEvent.setup();
    const entry = discriminationGaIn();
    const { container } = renderWithProviders(
      <ParticleVerbCard
        card={cardFor(entry, 'cloze')}
        repetitions={3}
        introducedParticles={INTRODUCED}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'gå in' }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: REPLAY })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Replay movement: in' })).toBeInTheDocument();
    expect(glyphMovers(container)).toHaveLength(1);
    expect(screen.getByText(/often movement inwards, or entry/)).toBeInTheDocument();
    expect(findParagraph(container, 'gå in')).toBeInTheDocument();
  });

  it.each(['gå ut', 'gå upp'])(
    'discrimination, tapping lure "%s" never shows the lure glyph',
    async (lureLabel) => {
      const user = userEvent.setup();
      const entry = discriminationGaIn();
      const { container } = renderWithProviders(
        <ParticleVerbCard
          card={cardFor(entry, 'cloze')}
          repetitions={3}
          introducedParticles={INTRODUCED}
        />,
      );
      await user.click(screen.getByRole('button', { name: lureLabel }));

      expect(await screen.findByText('Not quite')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: REPLAY })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Replay movement: in' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Replay movement: ut' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Replay movement: upp' })).toBeNull();
      expect(glyphMovers(container)).toHaveLength(1);
    },
  );

  it('unflagged entry (pv:tycka-om) shows no glyph, but sense line and lemma', async () => {
    const user = userEvent.setup();
    const entry = realEntry('pv:tycka-om');
    expect(getParticleGlyph(entry)).toBeNull();
    const sense = getParticleCoreSense(entry.particle);
    expect(sense).not.toBeNull();

    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    await typeAnswer(user, 'på');
    expect(await screen.findByText('Not quite')).toBeInTheDocument();
    expectNoGlyph(container);
    expect(screen.getByText(new RegExp(sense!.slice(0, 20)))).toBeInTheDocument();
    expect(findParagraph(container, renderLemma(entry))).toBeInTheDocument();
  });

  it('unflagged entry, correct typed answer, shows no glyph', async () => {
    const user = userEvent.setup();
    const entry = realEntry('pv:tycka-om');
    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    await typeAnswer(user, 'om');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expectNoGlyph(container);
  });
});

describe('glyph placement', () => {
  async function gradedGaIn() {
    const user = userEvent.setup();
    const entry = realEntry('pv:ga-in');
    const view = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    await typeAnswer(user, 'in');
    await screen.findByText('Correct!');
    return { ...view, entry, user };
  }

  it('sits inside the lemma card, before the lemma heading', async () => {
    const { container, entry } = await gradedGaIn();
    const lemmaHeading = findParagraph(container, renderLemma(entry));
    const lemmaCard = lemmaHeading.parentElement!;
    const replay = screen.getByRole('button', { name: REPLAY });

    expect(lemmaCard).toContainElement(replay);
    expect(
      replay.compareDocumentPosition(lemmaHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The glyph is the first thing in the lemma card, not squeezed in later.
    expect(lemmaCard.firstElementChild).toContainElement(replay);
  });

  it('keeps the sense line free of any glyph, outside the lemma card', async () => {
    const { container, entry } = await gradedGaIn();
    const sense = screen.getByText(/often movement inwards, or entry/);
    const lemmaCard = findParagraph(container, renderLemma(entry)).parentElement!;

    expect(sense.tagName).toBe('P');
    expect(within(sense).queryByRole('button')).toBeNull();
    expect(sense.querySelector('svg')).toBeNull();
    expect(sense.querySelector(GLYPH_SELECTOR)).toBeNull();
    expect(lemmaCard).not.toContainElement(sense);
  });
});

describe('replay control', () => {
  it('is a 44px button with an accessible name; click restarts the SVG; Next Card stays clickable', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(entry, 'cloze')} onAnswer={onAnswer} />,
    );
    await typeAnswer(user, 'in');
    await screen.findByText('Correct!');

    const replay = screen.getByRole('button', { name: 'Replay movement: in' });
    expect(replay).toHaveClass('size-11');

    const before = container.querySelector(`${GLYPH_SELECTOR}`)!.closest('svg');
    expect(before).not.toBeNull();
    await user.click(replay);
    const after = container.querySelector(`${GLYPH_SELECTOR}`)!.closest('svg');
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(before!.isConnected).toBe(false);
    // Still exactly one glyph after the restart.
    expect(glyphMovers(container)).toHaveLength(1);

    const next = screen.getByRole('button', { name: 'Next Card' });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(onAnswer).toHaveBeenCalledWith(5, undefined);
  });
});

describe('reduced motion', () => {
  it('renders an aria-hidden glyph with no button; Next Card still works', async () => {
    mockReducedMotion(true);
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const entry = realEntry('pv:ga-in');
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(entry, 'cloze')} onAnswer={onAnswer} />,
    );
    await typeAnswer(user, 'ut');
    await screen.findByText('Not quite');

    expect(screen.queryByRole('button', { name: REPLAY })).toBeNull();
    const movers = glyphMovers(container);
    expect(movers).toHaveLength(1);
    const wrapper = movers[0]!.closest('[aria-hidden="true"]:not(svg)');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.tagName).not.toBe('BUTTON');
    expect(container.querySelectorAll('svg .particle-glyph-mover')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Next Card' }));
    expect(onAnswer).toHaveBeenCalledWith(0, undefined);
  });
});

describe('the card relies on getParticleGlyph and adds no gate of its own', () => {
  async function gradeTyped(entry: ParticleVerbData) {
    const user = userEvent.setup();
    const view = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    await typeAnswer(user, 'in');
    await screen.findByText('Correct!');
    return view;
  }

  it('shows the glyph for the untouched flagged entry (control)', async () => {
    const { container } = await gradeTyped(realEntry('pv:ga-in'));
    expect(glyphMovers(container)).toHaveLength(1);
  });

  it('drops the glyph when motionGlyphVerified is removed', async () => {
    const { motionGlyphVerified: _dropped, ...rest } = realEntry('pv:ga-in');
    void _dropped;
    const entry = rest as ParticleVerbData;
    expect(getParticleGlyph(entry)).toBeNull();
    const { container } = await gradeTyped(entry);
    expectNoGlyph(container);
    // The sense line is independent of the glyph gate.
    expect(screen.getByText(/often movement inwards, or entry/)).toBeInTheDocument();
  });

  it('drops the glyph when a contrast is added', async () => {
    const entry: ParticleVerbData = { ...realEntry('pv:ga-in'), contrast: 'gå ut' };
    expect(getParticleGlyph(entry)).toBeNull();
    const { container } = await gradeTyped(entry);
    expectNoGlyph(container);
  });

  it('drops the glyph when transparency is not literal', async () => {
    const entry: ParticleVerbData = { ...realEntry('pv:ga-in'), transparency: 'idiomatic' };
    expect(getParticleGlyph(entry)).toBeNull();
    const { container } = await gradeTyped(entry);
    expectNoGlyph(container);
  });
});

// Keeps fireEvent import honest for the sanity check below: the replay button
// must be reachable by a plain DOM click as well as user-event.
describe('replay via DOM click', () => {
  it('fireEvent.click also restarts the glyph', async () => {
    const user = userEvent.setup();
    const entry = realEntry('pv:ga-ner');
    const { container } = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
    await typeAnswer(user, 'ned');
    await screen.findByText('Correct!');
    const before = container.querySelector(GLYPH_SELECTOR)!.closest('svg');
    fireEvent.click(screen.getByRole('button', { name: 'Replay movement: ner' }));
    expect(container.querySelector(GLYPH_SELECTOR)!.closest('svg')).not.toBe(before);
  });
});
