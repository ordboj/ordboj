import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ParticleVerbCard } from '@/components/ParticleVerbCard';
import { particleItemId } from '@/lib/itemIds';
import { findParticleVerb } from '@/lib/particleVerbs';
import type { ParticleSittingCard } from '@/lib/particleQueue';

// ORD-144: on a graded choice card the panel lemma is a real <h2> and the
// pronounce control sits on the lemma row (not beside the example), so the
// feedback panel fits 360x640. Typed cards keep a plain <h2> with no
// pronounce control.

const INTRODUCED = new Set(['undan', 'upp', 'bort']);

function cardFor(id: string, kind: 'cloze' | 'recall'): ParticleSittingCard {
  const entry = findParticleVerb(id)!;
  return { kind, entry, itemId: particleItemId(id, kind), countsTowardGoal: true };
}

async function gradedChoice(lure: string) {
  const user = userEvent.setup();
  const view = renderWithProviders(
    <ParticleVerbCard
      card={cardFor('pv:plocka-undan', 'cloze')}
      repetitions={3}
      introducedParticles={INTRODUCED}
    />,
  );
  await user.click(screen.getByRole('button', { name: lure }));
  await screen.findByText('Not quite');
  return view;
}

describe('ORD-144: choice-card feedback lemma row', () => {
  it.each(['plocka upp', 'plocka bort'])(
    'after wrong tap "%s" the lemma is a real <h2> sharing a row with the pronounce button',
    async (lure) => {
      await gradedChoice(lure);
      const headings = screen.getAllByRole('heading', { level: 2 });
      const lemma = headings.find((h) => h.textContent === 'plocka undan')!;
      expect(lemma).toBeDefined();
      expect(lemma.tagName).toBe('H2');
      // Exactly one lemma heading: the prompt h2 is unmounted once graded.
      expect(headings.filter((h) => h.textContent === 'plocka undan')).toHaveLength(1);

      const pronounce = screen.getByRole('button', { name: 'Pronounce sentence' });
      expect(lemma.parentElement).toContainElement(pronounce);
      // Row order: spacer, lemma, pronounce (lemma precedes the button).
      expect(
        lemma.compareDocumentPosition(pronounce) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it('the example sentence is no longer in the pronounce button row', async () => {
    await gradedChoice('plocka upp');
    const pronounce = screen.getByRole('button', { name: 'Pronounce sentence' });
    const example = document.querySelector('p[lang="sv"].text-base')!;
    expect(example).toBeTruthy();
    expect(pronounce.parentElement).not.toContainElement(example as HTMLElement);
  });

  it('typed cloze keeps a real <h2> lemma and has no pronounce button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ParticleVerbCard card={cardFor('pv:plocka-undan', 'cloze')} />);
    await user.type(screen.getByRole('textbox'), 'xyz');
    await user.click(screen.getByRole('button', { name: 'Check Answer' }));
    await screen.findByText('Not quite');
    const lemma = screen
      .getAllByRole('heading', { level: 2 })
      .find((h) => h.textContent === 'plocka undan')!;
    expect(lemma.tagName).toBe('H2');
    expect(within(document.body).queryByRole('button', { name: 'Pronounce sentence' })).toBeNull();
  });
});
