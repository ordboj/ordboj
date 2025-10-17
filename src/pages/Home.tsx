import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Settings, Trophy } from 'lucide-react';
import { useSrsProgress } from '@/hooks/useSrsProgress';
import { loadVoices } from '@/lib/speech';

export default function Home() {
  const navigate = useNavigate();
  const { getDueItems, initializeAllItems } = useSrsProgress();

  useEffect(() => {
    initializeAllItems();
    loadVoices();
  }, []);

  const dueCount = getDueItems().length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold text-primary mb-2">
            Svenska Verb
          </h1>
          <p className="text-xl text-muted-foreground">
            Master Swedish verbs with spaced repetition
          </p>
        </div>

        {/* Main Practice Card */}
        <Card className="shadow-2xl border-2 border-primary/20">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-3xl flex items-center justify-center gap-2">
              <BookOpen className="w-8 h-8 text-primary" />
              Ready to Practice?
            </CardTitle>
            <CardDescription className="text-lg">
              {dueCount > 0 ? (
                <span className="text-primary font-semibold">
                  {dueCount} cards due for review
                </span>
              ) : (
                <span>All caught up! Great work! 🎉</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => navigate('/practice')}
              className="w-full py-8 text-2xl font-bold shadow-lg hover:shadow-xl transition-all"
              size="lg"
              disabled={dueCount === 0}
            >
              {dueCount > 0 ? 'Start Practice' : 'No Cards Due'}
            </Button>

            {dueCount === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Come back later for more practice
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats & Settings */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="text-center">
              <Trophy className="w-8 h-8 mx-auto text-accent mb-2" />
              <CardTitle className="text-lg">Progress</CardTitle>
              <CardDescription>
                Track your learning
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/settings')}
          >
            <CardHeader className="text-center">
              <Settings className="w-8 h-8 mx-auto text-primary mb-2" />
              <CardTitle className="text-lg">Settings</CardTitle>
              <CardDescription>
                Customize your practice
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          Practicing Swedish verbs with confidence ✨
        </p>
      </div>
    </div>
  );
}
