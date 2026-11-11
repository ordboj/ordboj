import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ParticleVerbCard } from '@/components/ParticleVerbCard';
import { particleItemId } from '@/lib/itemIds';
import {
  getAcceptedParticles,
  getParticleGlyph,
  getVerifiedParticleVerbs,
} from '@/lib/particleVerbs';
import type { ParticleVerbData } from '@/data/particleVerbData';
import type { ParticleSittingCard } from '@/lib/particleQueue';

// ORD-134: a meaning picture shows only when getMeaningPicture allows it, and
// never alongside a motion glyph.

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

const PICTURE = '[data-meaning-picture]';
const GLYPH = '.particle-glyph-mover';

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

async function answerCloze(entry: ParticleVerbData) {
  const user = userEvent.setup();
  const view = renderWithProviders(<ParticleVerbCard card={cardFor(entry, 'cloze')} />);
  await user.type(screen.getByRole('textbox'), getAcceptedParticles(entry)[0]!);
  const check = screen.queryByRole('button', { name: 'Check Answer' });
  if (check) await user.click(check);
  await screen.findByText('Correct!');
  return view;
}

describe('meaning picture on the card', () => {
  it('renders no picture for an entry without approval, on feedback', async () => {
    const entry = realEntry('pv:ge-upp');
    const copy: ParticleVerbData = { ...entry };
    delete copy.meaningPictureApproved;
    const { container } = await answerCloze(copy);
    expect(container.querySelector(PICTURE)).toBeNull();
  });

  it('renders no picture for an unapproved entry on the introduction card', () => {
    const copy: ParticleVerbData = { ...realEntry('pv:ge-upp') };
    delete copy.meaningPictureApproved;
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(copy, 'introduction')} />,
    );
    expect(screen.getByText('A new particle verb')).toBeInTheDocument();
    expect(container.querySelector(PICTURE)).toBeNull();
  });

  it('shows white-flag for pv:ge-upp on the feedback block', async () => {
    const { container } = await answerCloze(realEntry('pv:ge-upp'));
    expect(container.querySelectorAll(PICTURE)).toHaveLength(1);
    expect(container.querySelector('[data-meaning-picture="white-flag"]')).not.toBeNull();
    expect(container.querySelectorAll(GLYPH)).toHaveLength(0);
  });

  it('shows white-flag for pv:ge-upp on the introduction card', () => {
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(realEntry('pv:ge-upp'), 'introduction')} />,
    );
    expect(container.querySelectorAll(PICTURE)).toHaveLength(1);
    expect(container.querySelector('[data-meaning-picture="white-flag"]')).not.toBeNull();
    expect(container.querySelectorAll(GLYPH)).toHaveLength(0);
  });

  it('shows no picture before grading', () => {
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(realEntry('pv:ge-upp'), 'cloze')} />,
    );
    expect(container.querySelector(PICTURE)).toBeNull();
  });

  it('a glyph entry (pv:ga-in) shows its glyph and no picture', async () => {
    const entry = realEntry('pv:ga-in');
    expect(getParticleGlyph(entry)).toBe('in');
    const { container } = await answerCloze(entry);
    expect(container.querySelectorAll(GLYPH)).toHaveLength(1);
    expect(container.querySelector(PICTURE)).toBeNull();
  });

  it('a glyph entry on the introduction card shows no picture', () => {
    const { container } = renderWithProviders(
      <ParticleVerbCard card={cardFor(realEntry('pv:ga-in'), 'introduction')} />,
    );
    expect(container.querySelectorAll(GLYPH)).toHaveLength(1);
    expect(container.querySelector(PICTURE)).toBeNull();
  });
});
