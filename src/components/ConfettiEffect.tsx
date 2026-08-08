import { useEffect } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiEffectProps {
  trigger: boolean;
}

export function ConfettiEffect({ trigger }: ConfettiEffectProps) {
  useEffect(() => {
    if (!trigger) return;

    // A learner who has asked the OS for less motion does not want a burst
    // of 100 animated particles for a correct answer -- skip the animation
    // entirely rather than merely toning it down.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#005293', '#FFCD00', '#10B981'],
    });
  }, [trigger]);

  return null;
}
