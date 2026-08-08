import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Volume2 } from 'lucide-react';
import { ConjugatedVerb, Form, getExampleSentence, getFormLabel } from '@/lib/verbs';
import { SrsState } from '@/lib/srs';
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

  const getStageBadge = (stage: number) => {
    if (stage === 0) return { label: 'New', color: 'bg-purple-500' };
    if (stage <= 2) return { label: 'Learning', color: 'bg-orange-500' };
    if (stage <= 4) return { label: 'Reviewing', color: 'bg-yellow-500' };
    return { label: 'Mastered', color: 'bg-green-500' };
  };

  const badge = getStageBadge(srsStage);

  const getFormSrsInfo = (form: Form) => {
    const itemId = `${verb.id}-${form}`;
    const state = srsStates[itemId];
    if (!state) return null;

    const nextReview = new Date(state.dueAt);
    const isOverdue = nextReview.getTime() <= Date.now();

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
              <span className="text-2xl">{verb.infinitive}</span>
              <Button variant="ghost" size="icon" onClick={() => handleSpeak(verb.infinitive)}>
                <Volume2 className="w-5 h-5" />
              </Button>
            </div>
            <Badge className={badge.color}>{badge.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Infinitive */}
          <div>
            <p className="text-sm text-muted-foreground">Infinitive</p>
            <p className="text-lg font-medium">{verb.infinitive}</p>
          </div>

          {/* CEFR Level */}
          <div>
            <p className="text-sm text-muted-foreground">Difficulty Level</p>
            <Badge variant="outline">{verb.cefr}</Badge>
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

                if (formValue === '(not available)' || !formValue) return null;

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
                      <p className="text-lg font-semibold text-primary">{formValue}</p>
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
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-sm italic text-muted-foreground">
                        {getExampleSentence(verb.infinitive, form)}
                      </p>
                    </div>
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
