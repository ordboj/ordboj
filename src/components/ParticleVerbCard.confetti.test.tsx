import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import confetti from 'canvas-confetti';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ParticleVerbCard } from '@/components/ParticleVerbCard';
import { particleItemId } from '@/lib/itemIds';
import { getAcceptedParticles, getVerifiedParticleVerbs } from '@/lib/particleVerbs';
import type { ParticleSittingCard } from '@/lib/particleQueue';

// ORD-122: a correct particle answer no longer fires the per-answer confetti
// burst. canvas-confetti is neutralized globally in src/test/setup.ts, so the
// mock's call record is the observable: the real ConfettiEffect would call it
// on any correct answer if the card still rendered it.

function clozeCard(base: string, particle: string): ParticleSittingCard {
  const entry = getVerifiedParticleVerbs().find(
    (candidate) => candidate.baseInfinitive === base && candidate.particle === particle,
  )!;
  return {
    kind: 'cloze',
    entry,
    itemId: particleItemId(entry.id, 'cloze'),
    countsTowardGoal: true,
  };
}

describe('ParticleVerbCard confetti removal (ORD-122)', () => {
  it('fires no confetti on a correct typed answer', async () => {
    const user = userEvent.setup();
    const card = clozeCard('komma', 'ihåg');
    renderWithProviders(<ParticleVerbCard card={card} repetitions={0} />);

    await user.type(screen.getByRole('textbox'), getAcceptedParticles(card.entry)[0]!);
    // An exact match auto-submits; click Check Answer only if it did not.
    const check = screen.queryByRole('button', { name: 'Check Answer' });
    if (check) await user.click(check);

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(confetti).not.toHaveBeenCalled();
  });

  it('fires no confetti on a correct multiple-choice tap', async () => {
    const user = userEvent.setup();
    const card = clozeCard('komma', 'ihåg');
    renderWithProviders(
      <ParticleVerbCard
        card={card}
        repetitions={3}
        introducedParticles={new Set(['in', 'fram'])}
      />,
    );

    await screen.findByText('Choose the correct particle verb');
    await user.click(screen.getByRole('button', { name: 'komma ihåg' }));

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(confetti).not.toHaveBeenCalled();
  });
});
