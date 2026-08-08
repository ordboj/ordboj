import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ReadOnlyBanner } from '@/components/ReadOnlyBanner';

// Issue #263, acceptance criteria: when useSrsProgress reports isReadOnly,
// the practice surfaces must show a visible indicator that (a) explains
// progress from this session will not be saved and (b) suggests a refresh/
// update as the fix. Practice.test.tsx and PracticeParticles.test.tsx pin
// that the banner *appears* on the right screens; this file pins what the
// banner itself actually says and how it's exposed to assistive tech, so a
// future edit that keeps the banner present but drops either half of the
// required message (or its accessible role) still gets caught here even if
// the "won't be saved" substring survives.
describe('ReadOnlyBanner', () => {
  it('is exposed to assistive tech as a status region', () => {
    renderWithProviders(<ReadOnlyBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('explains that this session will not be saved', () => {
    renderWithProviders(<ReadOnlyBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(/progress from this session/i);
    expect(screen.getByRole('status')).toHaveTextContent(/won.t be saved/i);
  });

  it('suggests refreshing the page or updating the app as the fix', () => {
    renderWithProviders(<ReadOnlyBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(/refresh the page/i);
    expect(screen.getByRole('status')).toHaveTextContent(/update the app/i);
  });
});
