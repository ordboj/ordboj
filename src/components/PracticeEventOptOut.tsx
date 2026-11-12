import { useEffect, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { getAuthSnapshot } from '@/lib/auth/session';
import {
  getPracticeEventPreferenceServerSnapshot,
  getPracticeEventPreferenceSnapshot,
  loadPracticeEventPreference,
  savePracticeEventOptOut,
  subscribePracticeEventPreference,
} from '@/lib/practiceEvents';

/**
 * Legitimate-interest objection. The switch is on until the signed-in
 * learner turns it off. Turning it off stops new practice events and
 * deletes the ones already stored for that account. This is not a consent
 * wall before practice.
 */
export function PracticeEventOptOut() {
  const preference = useSyncExternalStore(
    subscribePracticeEventPreference,
    getPracticeEventPreferenceSnapshot,
    getPracticeEventPreferenceServerSnapshot,
  );
  const [pending, setPending] = useState(false);
  const snap = getAuthSnapshot();
  const online = snap.status === 'authenticated' && snap.offline === false;

  useEffect(() => {
    if (!online) return;
    void loadPracticeEventPreference();
  }, [online]);

  if (snap.status !== 'authenticated') return null;

  const save = (nextOptedOut: boolean) => {
    setPending(true);
    void savePracticeEventOptOut(nextOptedOut).finally(() => {
      setPending(false);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p id="store-practice-events-help" className="text-sm text-muted-foreground">
          After you sign in, Ordböj stores practice events in a first-party database in the EU to
          improve the trainer. Turn off Store practice events to object. Ordböj then stops storing
          these events and deletes the ones it has for your account.{' '}
          <a href="/privacy" className="text-primary underline underline-offset-4">
            Privacy Policy
          </a>
        </p>
        {snap.offline ? (
          <p className="text-sm text-muted-foreground">
            Connect to the internet to turn practice events off.
          </p>
        ) : preference.status === 'unavailable' ? (
          <p className="text-sm text-muted-foreground">
            Practice events are unavailable right now. Try again later.
          </p>
        ) : preference.status !== 'ready' ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex items-center justify-between">
            <Label htmlFor="store-practice-events">Store practice events</Label>
            <label
              htmlFor="store-practice-events"
              className="flex min-h-11 min-w-11 items-center justify-center cursor-pointer"
            >
              <Switch
                id="store-practice-events"
                checked={!preference.optedOut}
                disabled={pending}
                aria-describedby="store-practice-events-help"
                onCheckedChange={(checked) => save(!checked)}
              />
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
