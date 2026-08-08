import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Volume2 } from 'lucide-react';
import { ConjugatedVerb, Form, getExampleSentence, getFormLabel, getVerbGrupp } from '@/lib/verbs';
import { conjugationItemId } from '@/lib/itemIds';
import { getMasteryStageBadge, isDue, SrsState } from '@/lib/srs';
import { speakSwedish } from '@/lib/speech';
import { useSettings } from '@/hooks/useSettings';

interface VerbDetailsModalProps {
  verb: ConjugatedVerb;
  srsStage: number;
  srsStates: Record<string, SrsState>;
  onClose: () => void;
}

export function VerbDetailsModal({ verb, srsStage, srsStates, onClose }: VerbDetailsModalProps) {
  const { settings } = useSettings();

  const forms: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];

  const badge = getMasteryStageBadge(srsStage);
  // Konjugationsgrupp predicts the answer's ending pattern, so it's only
  // ever surfaced here (a reference view, opened after the fact) — never
  // pre-answer on the practice card. undefined means "not known" and is
  // rendered as absent, never guessed (src/lib/verbs.ts:29-32).
  const grupp = getVerbGrupp(verb.infinitive);

  const getFormSrsInfo = (form: Form) => {
    const itemId = conjugationItemId(verb.id, form);
    const state = srsStates[itemId];
    if (!state) return null;

    const nextReview = new Date(state.dueAt);
    const isOverdue = isDue(state);

    return {
      repetitions: state.repetitions,
      intervalDays: state.intervalDays,
      nextReview: nextReview.toLocaleDateString(),
      isOverdue,
      easeFactor: state.easeFactor.toFixed(2),
    };
  };

  const handleSpeak = (text: string) => {
    speakSwedish(text, settings.muteAudio);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl" lang="sv">
                {verb.infinitive}
              </span>
              <Button variant="ghost" size="icon" onClick={() => handleSpeak(verb.infinitive)}>
                <Volume2 className="w-5 h-5" />
              </Button>
            </div>
            {/* Issue #227: outline hardcoded, not badge.variant. Badge defaults to
                the `default` variant when none is passed, whose hover:bg-primary
                opacity class clashes with badge.color's stage token on hover for
                every non-New stage (the #313 regression). `outline` carries no
                background or hover utility, so badge.color's stage bg and
                foreground text classes are the only source of color. */}
            <Badge variant="outline" className={badge.color}>
              {badge.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Infinitiv */}
          <div>
            <p className="text-sm text-muted-foreground">{getFormLabel('infinitive')}</p>
            <p className="text-lg font-medium" lang="sv">
              {verb.infinitive}
            </p>
          </div>

          {/* CEFR Level */}
          <div>
            <p className="text-sm text-muted-foreground">Difficulty Level</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{verb.cefr}</Badge>
              {grupp && <Badge variant="outline">grupp {grupp}</Badge>}
            </div>
          </div>

          {/* Overall Progress */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">Overall Progress</h3>
            <p className="text-sm text-muted-foreground">Average Stage: {srsStage} repetitions</p>
          </div>

          {/* Conjugations with SRS Info */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Conjugations & Progress</h3>
            <div className="space-y-4">
              {forms.map((form) => {
                const formValue = verb[form];
                const srsInfo = getFormSrsInfo(form);

                // imperativNotApplicable (#124) explicitly flags the common,
                // confirmed case: modal verbs, which grammatically have no
                // imperativ. The "(not available)" literal-string check
                // stays as a fallback for a couple of verbs (e.g. "te sig",
                // "anse" in verbData.ts) whose imperativ is intentionally
                // empty pending human review and are deliberately not
                // flagged imperativNotApplicable -- that field means
                // "confirmed absent," not "unconfirmed." This can go away
                // once swedish-linguist fills those forms or adds a field
                // for "known empty, not yet confirmed why."
                if (
                  (form === 'imperativ' && verb.imperativNotApplicable) ||
                  formValue === '(not available)' ||
                  !formValue
                )
                  return null;

                return (
                  <div key={form} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{getFormLabel(form)}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleSpeak(formValue)}
                        >
                          <Volume2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-lg font-semibold text-primary" lang="sv">
                        {formValue}
                      </p>
                    </div>

                    {srsInfo && (
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Repetitions: {srsInfo.repetitions}</p>
                        <p>Interval: {srsInfo.intervalDays} days</p>
                        <p className={srsInfo.isOverdue ? 'text-orange-500 font-medium' : ''}>
                          Next review: {srsInfo.nextReview} {srsInfo.isOverdue && '(Due now!)'}
                        </p>
                        <p>Ease Factor: {srsInfo.easeFactor}</p>
                      </div>
                    )}

                    {/* Example sentence */}
                    {(() => {
                      const example = getExampleSentence(verb.infinitive, form);
                      if (!example) return null;

                      return (
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-sm italic text-muted-foreground" lang="sv">
                            {example}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
