import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** International donations page. Do not replace this with another URL. */
const LOSEV_DONATION_URL = 'https://www.losev.org.tr/international-donations';

/**
 * English is the only UI locale: the app has no translation catalog and
 * no language switcher.
 */
const COPY = {
  body: 'Ordböj is free. If you want, you can donate to LÖSEV, a foundation for children with leukemia.',
  linkLabel: 'Support LÖSEV',
} as const;

type SupportLosevNoticeProps = {
  className?: string;
};

export function SupportLosevNotice({ className }: SupportLosevNoticeProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm text-muted-foreground">{COPY.body}</p>
      <Button
        variant="link"
        size="sm"
        className="h-auto px-0 text-sm font-normal text-muted-foreground underline underline-offset-4"
        asChild
      >
        <a href={LOSEV_DONATION_URL} target="_blank" rel="noopener noreferrer">
          {COPY.linkLabel}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </Button>
    </div>
  );
}
