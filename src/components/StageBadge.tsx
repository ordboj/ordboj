import { Badge } from '@/components/ui/badge';

// Shared SRS-stage badge, previously duplicated in VerbDetailsModal.tsx and
// Progress.tsx with raw Tailwind palette classes (bg-orange-500,
// bg-yellow-500, bg-green-500). Each pair below is a bg/foreground token
// defined in src/index.css (and mapped in tailwind.config.ts) chosen to
// clear WCAG 4.5:1 text contrast in the shipped (light-only, see
// docs/product/2026-08-08-dark-mode-decision.md) theme. "New" keeps the
// existing bg-primary token rather than a new one (issue #112 already
// pinned this via VerbDetailsModal.test.tsx / Progress.test.tsx).
export interface StageBadgeInfo {
  label: string;
  className: string;
}

export function getStageBadge(stage: number): StageBadgeInfo {
  if (stage === 0) return { label: 'New', className: 'bg-primary text-primary-foreground' };
  if (stage <= 2)
    return { label: 'Learning', className: 'bg-stage-learning text-stage-learning-foreground' };
  if (stage <= 4)
    return {
      label: 'Reviewing',
      className: 'bg-stage-reviewing text-stage-reviewing-foreground',
    };
  return { label: 'Mastered', className: 'bg-stage-mastered text-stage-mastered-foreground' };
}

interface StageBadgeProps {
  stage: number;
}

export function StageBadge({ stage }: StageBadgeProps) {
  const badge = getStageBadge(stage);
  return <Badge className={badge.className}>{badge.label}</Badge>;
}
