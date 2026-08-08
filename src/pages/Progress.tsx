import { useState, useEffect, useMemo } from 'react';
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
import { ArrowLeft, Search, ArrowUpDown } from 'lucide-react';
import { getAllConjugatedVerbs, ConjugatedVerb } from '@/lib/verbs';
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

  const getSrsStage = (verbId: string): number => {
    const forms = ['presens', 'preteritum', 'supinum', 'imperativ'];
    let totalReps = 0;
    let count = 0;

    forms.forEach((form) => {
      const itemId = `${verbId}-${form}`;
      const state = srsStates[itemId];
      if (state) {
        totalReps += state.repetitions;
        count++;
      }
    });

    return count > 0 ? Math.floor(totalReps / count) : 0;
  };

  const getStageBadge = (stage: number) => {
    if (stage === 0) return { label: 'New', variant: 'default' as const, color: 'bg-purple-500' };
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
  }, [verbs, searchQuery, difficultyFilter, srsFilter, sortField, sortDirection, srsStates]);

  const progressStats = useMemo(() => {
    const total = verbs.length;
    const mastered = verbs.filter((verb) => getSrsStage(verb.id) >= 5).length;
    const percentage = total > 0 ? (mastered / total) * 100 : 0;
    return { total, mastered, percentage };
  }, [verbs, srsStates]);

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
      <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex items-center justify-center">
        <p className="text-xl text-muted-foreground">Loading progress...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-primary">🇸🇪 Progress & Review</h1>
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
            <ProgressBar value={progressStats.percentage} className="h-4" />
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

        {/* Verb list: stacked cards on narrow screens, table from md up */}
        <div className="md:hidden space-y-3">
          {filteredAndSortedVerbs.map((verb) => {
            const stage = getSrsStage(verb.id);
            const badge = getStageBadge(stage);
            return (
              <button
                key={verb.id}
                type="button"
                onClick={() => setSelectedVerb(verb)}
                className="w-full text-left bg-card border rounded-lg p-4 space-y-2 active:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-lg">{verb.infinitive}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">{verb.cefr}</Badge>
                    <Badge variant={badge.variant} className={badge.color}>
                      {badge.label}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Presens:</span> {verb.presens}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Preteritum:</span>{' '}
                    {verb.preteritum}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Supinum:</span> {verb.supinum}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Imperativ:</span> {verb.imperativ}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <Card className="hidden md:block">
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
                  return (
                    <TableRow
                      key={verb.id}
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                        index % 2 === 0 ? 'bg-muted/20' : ''
                      }`}
                      onClick={() => setSelectedVerb(verb)}
                    >
                      <TableCell className="font-medium">{verb.infinitive}</TableCell>
                      <TableCell>{verb.presens}</TableCell>
                      <TableCell>{verb.preteritum}</TableCell>
                      <TableCell>{verb.supinum}</TableCell>
                      <TableCell>{verb.imperativ}</TableCell>
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
