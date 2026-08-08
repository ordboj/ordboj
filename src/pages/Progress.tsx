import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress as ProgressBar } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Search, ArrowUpDown, Trophy } from 'lucide-react';
import { getAllConjugatedVerbs, getVerbGrupp, ConjugatedVerb, type Form } from '@/lib/verbs';
import { conjugationItemId, particleItemId } from '@/lib/itemIds';
import { getVerifiedParticleVerbs, hasRecallItem, renderLemma } from '@/lib/particleVerbs';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { useSettings } from '@/hooks/useSettings';
import { VerbDetailsModal } from '@/components/VerbDetailsModal';

type SortField = 'infinitive' | 'difficulty';
type SortDirection = 'asc' | 'desc';

export default function Progress() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { srsStates } = useSrsProgress(settings.cefrLevels);

  const [verbs, setVerbs] = useState<ConjugatedVerb[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [srsFilter, setSrsFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('infinitive');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedVerb, setSelectedVerb] = useState<ConjugatedVerb | null>(null);

  useEffect(() => {
    const loadVerbs = async () => {
      setIsLoading(true);
      const conjugated = await getAllConjugatedVerbs();
      setVerbs(conjugated);
      setIsLoading(false);
    };
    loadVerbs();
  }, []);

  const getSrsStage = useCallback(
    (verbId: string): number => {
      const forms: Form[] = ['presens', 'preteritum', 'supinum', 'imperativ'];
      let totalReps = 0;
      let count = 0;

      forms.forEach((form) => {
        const itemId = conjugationItemId(verbId, form);
        const state = srsStates[itemId];
        if (state) {
          totalReps += state.repetitions;
          count++;
        }
      });

      return count > 0 ? Math.floor(totalReps / count) : 0;
    },
    [srsStates],
  );

  const getStageBadge = (stage: number) => {
    if (stage === 0) return { label: 'New', variant: 'default' as const, color: 'bg-primary' };
    if (stage <= 2)
      return { label: 'Learning', variant: 'secondary' as const, color: 'bg-orange-500' };
    if (stage <= 4)
      return { label: 'Reviewing', variant: 'outline' as const, color: 'bg-yellow-500' };
    return { label: 'Mastered', variant: 'default' as const, color: 'bg-green-500' };
  };

  const filteredAndSortedVerbs = useMemo(() => {
    let filtered = verbs;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter((verb) =>
        verb.infinitive.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Difficulty filter
    if (difficultyFilter !== 'all') {
      filtered = filtered.filter((verb) => verb.cefr === difficultyFilter);
    }

    // SRS filter
    if (srsFilter !== 'all') {
      filtered = filtered.filter((verb) => {
        const stage = getSrsStage(verb.id);
        const badge = getStageBadge(stage);
        return badge.label.toLowerCase() === srsFilter;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'infinitive') {
        comparison = a.infinitive.localeCompare(b.infinitive);
      } else if (sortField === 'difficulty') {
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        comparison = levels.indexOf(a.cefr || '') - levels.indexOf(b.cefr || '');
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [verbs, searchQuery, difficultyFilter, srsFilter, sortField, sortDirection, getSrsStage]);

  const progressStats = useMemo(() => {
    const total = verbs.length;
    const mastered = verbs.filter((verb) => getSrsStage(verb.id) >= 5).length;
    const percentage = total > 0 ? (mastered / total) * 100 : 0;
    return { total, mastered, percentage };
  }, [verbs, getSrsStage]);

  // Particle mode's own numbers. The page below is built entirely around the
  // four conjugation forms and the verb table, so the particle view is a
  // separate summary rather than extra columns that would be blank for every
  // conjugation row.
  //
  // "Started" counts verbs whose cloze item exists at all, which is what
  // lazy initialization makes meaningful: an untouched verb has no state, so
  // the denominator is the corpus and the numerator is genuine contact.
  const particleStats = useMemo(() => {
    const entries = getVerifiedParticleVerbs();
    let started = 0;
    let clozeMastered = 0;
    let recallUnlocked = 0;
    const recallEligible = entries.filter(hasRecallItem).length;

    for (const entry of entries) {
      const cloze = srsStates[particleItemId(entry.id, 'cloze')];
      if (!cloze) continue;
      started += 1;
      if (cloze.repetitions >= 5) clozeMastered += 1;
      if (hasRecallItem(entry) && srsStates[particleItemId(entry.id, 'recall')]) {
        recallUnlocked += 1;
      }
    }

    return {
      total: entries.length,
      started,
      clozeMastered,
      recallUnlocked,
      recallEligible,
      startedPercent: entries.length > 0 ? (started / entries.length) * 100 : 0,
    };
  }, [srsStates]);

  const particleVerbList = useMemo(() => {
    return getVerifiedParticleVerbs().map((entry) => {
      const cloze = srsStates[particleItemId(entry.id, 'cloze')];
      const recall = hasRecallItem(entry)
        ? srsStates[particleItemId(entry.id, 'recall')]
        : undefined;
      return {
        id: entry.id,
        lemma: renderLemma(entry),
        particle: entry.particle,
        gloss: entry.gloss.en,
        cefr: entry.cefr,
        clozeRepetitions: cloze?.repetitions ?? 0,
        started: cloze !== undefined,
        recallStarted: recall !== undefined,
        recallEligible: hasRecallItem(entry),
      };
    });
  }, [srsStates]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <p className="text-xl text-muted-foreground">Loading progress...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-primary flex items-center justify-center gap-2">
            <Trophy className="w-7 h-7" />
            Progress & Review
          </h1>
          <div className="w-24" /> {/* Spacer for centering */}
        </div>

        {/* Progress Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Your Progress</CardTitle>
            <CardDescription>
              You've mastered {progressStats.mastered} / {progressStats.total} verbs (
              {progressStats.percentage.toFixed(1)}%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressBar value={progressStats.percentage} className="h-4 bg-muted-foreground" />
          </CardContent>
        </Card>

        {/* Particle verbs — its own mode, so its own summary rather than
            columns that would be blank on every conjugation row. */}
        <Card>
          <CardHeader>
            <CardTitle>Particle verbs</CardTitle>
            <CardDescription>
              You've started {particleStats.started} / {particleStats.total} particle verbs
              {particleStats.clozeMastered > 0 &&
                `, ${particleStats.clozeMastered} well established`}
              {particleStats.recallEligible > 0 &&
                ` — ${particleStats.recallUnlocked} / ${particleStats.recallEligible} meaning prompts unlocked`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar value={particleStats.startedPercent} className="h-4 bg-muted-foreground" />
            {particleStats.started === 0 ? (
              <p className="text-sm text-muted-foreground">
                Particle verbs unlock once you know their base verb in both the present and the
                past.
              </p>
            ) : (
              <ScrollArea className="h-64">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Phrase</TableHead>
                      <TableHead>Meaning</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Stage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {particleVerbList
                      .filter((verb) => verb.started)
                      .map((verb) => {
                        const badge = getStageBadge(verb.clozeRepetitions);
                        return (
                          <TableRow key={verb.id}>
                            <TableCell className="font-medium">
                              <span lang="sv">{verb.lemma}</span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{verb.gloss}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{verb.cefr}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={badge.variant} className={badge.color}>
                                {badge.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search by verb..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="A1">A1</SelectItem>
                  <SelectItem value="A2">A2</SelectItem>
                  <SelectItem value="B1">B1</SelectItem>
                  <SelectItem value="B2">B2</SelectItem>
                  <SelectItem value="C1">C1</SelectItem>
                  <SelectItem value="C2">C2</SelectItem>
                </SelectContent>
              </Select>
              <Select value={srsFilter} onValueChange={setSrsFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="SRS Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                  <SelectItem value="reviewing">Reviewing</SelectItem>
                  <SelectItem value="mastered">Mastered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleSort('infinitive')}
                  >
                    <div className="flex items-center gap-2">
                      Verb
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </TableHead>
                  <TableHead>Presens</TableHead>
                  <TableHead>Preteritum</TableHead>
                  <TableHead>Supinum</TableHead>
                  <TableHead>Imperativ</TableHead>
                  <TableHead>Grupp</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleSort('difficulty')}
                  >
                    <div className="flex items-center gap-2">
                      Difficulty
                      <ArrowUpDown className="w-4 h-4" />
                    </div>
                  </TableHead>
                  <TableHead>SRS Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedVerbs.map((verb, index) => {
                  const stage = getSrsStage(verb.id);
                  const badge = getStageBadge(stage);
                  // Reference-only surface (never rendered pre-answer on
                  // the practice card); undefined stays absent, never
                  // guessed (src/lib/verbs.ts:29-32).
                  const grupp = getVerbGrupp(verb.infinitive);
                  return (
                    <TableRow
                      key={verb.id}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                        index % 2 === 0 ? 'bg-muted/20' : ''
                      }`}
                      onClick={() => setSelectedVerb(verb)}
                    >
                      <TableCell className="font-medium">
                        <span lang="sv">{verb.infinitive}</span>
                      </TableCell>
                      <TableCell>
                        <span lang="sv">{verb.presens}</span>
                      </TableCell>
                      <TableCell>
                        <span lang="sv">{verb.preteritum}</span>
                      </TableCell>
                      <TableCell>
                        <span lang="sv">{verb.supinum}</span>
                      </TableCell>
                      <TableCell>
                        {/* imperativNotApplicable (#124) explicitly flags the
                            common, confirmed case: modal verbs, which
                            grammatically have no imperativ. The
                            "(not available)" literal-string check stays as a
                            fallback for a couple of verbs (e.g. "te sig",
                            "anse" in verbData.ts) whose imperativ is
                            intentionally empty pending human review and are
                            deliberately not flagged imperativNotApplicable --
                            that field means "confirmed absent," not
                            "unconfirmed." This can go away once
                            swedish-linguist fills those forms or adds a field
                            for "known empty, not yet confirmed why." */}
                        {verb.imperativNotApplicable || verb.imperativ === '(not available)' ? (
                          <span className="text-muted-foreground">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">not applicable</span>
                          </span>
                        ) : (
                          <span lang="sv">{verb.imperativ}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {grupp ? (
                          <Badge variant="outline">grupp {grupp}</Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">not available</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{verb.cefr}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant} className={badge.color}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>

        {filteredAndSortedVerbs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No verbs found matching your filters
          </div>
        )}
      </div>

      {/* Verb Details Modal */}
      {selectedVerb && (
        <VerbDetailsModal
          verb={selectedVerb}
          srsStage={getSrsStage(selectedVerb.id)}
          srsStates={srsStates}
          onClose={() => setSelectedVerb(null)}
        />
      )}
    </div>
  );
}
