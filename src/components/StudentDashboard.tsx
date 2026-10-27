import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Flame, Target, Puzzle, ChevronRight } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL ;

interface PuzzleProgress {
  category: string;
  totalPuzzles: number;
  solvedPuzzles: number;
  puzzleDetails: {
    puzzleName: string;
    solved: boolean;
    attempts: number;
  }[];
}

const StudentDashboard: React.FC = () => {
  const { user, token } = useAuth();
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalPuzzlesSolved, setTotalPuzzlesSolved] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);
  const [puzzleProgress, setPuzzleProgress] = useState<PuzzleProgress[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Load puzzle progress and attendance streaks.
  useEffect(() => {
    const loadData = async () => {
      if (!user || !token) return;
      setIsLoading(true);
      setLoadError(false);
      setAttendanceError(false);

      try {
        // Fetch puzzle progress
        const progressRes = await fetch(`${API_BASE_URL}/users/${user.id}/puzzle-progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!progressRes.ok) throw new Error(`Puzzle progress request failed with status ${progressRes.status}`);
        const progress: PuzzleProgress[] = await progressRes.json();
        setPuzzleProgress(progress);
        const totalSolved = progress.reduce((sum, category) =>
          sum + category.solvedPuzzles, 0
        );
        setTotalPuzzlesSolved(totalSolved);

        try {
          const attendRes = await fetch(`${API_BASE_URL}/users/${user.id}/attendance`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!attendRes.ok) throw new Error(`Attendance request failed with status ${attendRes.status}`);
          const attendance: { date: string; status: 'present' | 'absent' }[] = await attendRes.json();

          const presentDays = new Set(attendance
            .filter(record => record.status === 'present')
            .map(record => new Date(record.date).toISOString().slice(0, 10)));
          const todayKey = new Date().toISOString().slice(0, 10);
          const yesterday = new Date();
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          const currentDate = presentDays.has(todayKey)
            ? new Date(`${todayKey}T00:00:00.000Z`)
            : presentDays.has(yesterday.toISOString().slice(0, 10))
              ? yesterday
              : null;
          let current = 0;
          while (currentDate && presentDays.has(currentDate.toISOString().slice(0, 10))) {
            current++;
            currentDate.setUTCDate(currentDate.getUTCDate() - 1);
          }

          const sortedPresentDays = Array.from(presentDays).sort();
          let longest = 0;
          let running = 0;
          let previousDate: Date | null = null;
          sortedPresentDays.forEach(dateKey => {
            const date = new Date(`${dateKey}T00:00:00.000Z`);
            const consecutive = previousDate !== null &&
              date.getTime() - previousDate.getTime() === 24 * 60 * 60 * 1000;
            running = consecutive ? running + 1 : 1;
            longest = Math.max(longest, running);
            previousDate = date;
          });
          setCurrentStreak(current);
          setLongestStreak(longest);
        } catch (err) {
          console.error('Load attendance data error', err);
          setAttendanceError(true);
        }
      } catch (err) {
        console.error('Load puzzle progress error', err);
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [user, token]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome & Streak Banner */}
      <div className="card-premium p-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-1">
              Welcome back, {user?.username || 'Student'}! 
            </h1>
            <p className="text-muted-foreground">
              Keep up the great work. You're making excellent progress!
            </p>
          </div>
          
          {/* Streak Display */}
          {!isLoading && !attendanceError && (currentStreak > 0 || longestStreak > 0) && (
            <div className="flex items-center gap-4">
              {currentStreak > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-warning/20 rounded-lg">
                  <Flame className="w-6 h-6 text-warning animate-pulse" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">{currentStreak}</p>
                    <p className="text-xs text-muted-foreground">Attendance Streak</p>
                  </div>
                </div>
              )}
              {longestStreak > 0 && (
                <div className="text-center px-4 py-2 bg-secondary rounded-lg">
                  <p className="text-lg font-bold text-foreground">{longestStreak}</p>
                  <p className="text-xs text-muted-foreground">Best Streak</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4">
        <Card className="card-premium">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Puzzle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{isLoading ? '—' : totalPuzzlesSolved}</p>
                <p className="text-xs text-muted-foreground">Total Solved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Puzzle Progress by Category */}
      {isLoading ? (
        <Card className="card-premium">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading puzzle progress…
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card className="card-premium">
          <CardContent className="p-6 text-sm text-destructive">
            Puzzle progress could not be loaded. Please try again later.
          </CardContent>
        </Card>
      ) : puzzleProgress.length === 0 ? (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Puzzle Progress by Category</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No puzzle progress is available yet.
          </CardContent>
        </Card>
      ) : (
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Puzzle Progress by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {puzzleProgress.map((category, idx) => (
                <div key={idx} className="border border-border rounded-lg overflow-hidden">
                  {/* Category Header - Always Visible */}
                  <div 
                    className="p-4 bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                    onClick={() => toggleCategory(category.category)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-foreground">{category.category}</h4>
                      <ChevronRight 
                        className={`w-4 h-4 text-muted-foreground transition-transform ${
                          expandedCategories.has(category.category) ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Completion:</span>
                      <span className={`font-medium ${
                        category.solvedPuzzles === category.totalPuzzles && category.totalPuzzles > 0
                          ? 'text-success'
                          : 'text-foreground'
                      }`}>
                        {category.solvedPuzzles} / {category.totalPuzzles}
                        {category.solvedPuzzles === category.totalPuzzles && category.totalPuzzles > 0 && ' ✓'}
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-secondary rounded-full h-2 mb-3">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          category.solvedPuzzles === category.totalPuzzles && category.totalPuzzles > 0
                            ? 'bg-success'
                            : 'bg-primary'
                        }`}
                        style={{ width: `${(category.solvedPuzzles / Math.max(category.totalPuzzles, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Expanded Puzzle Details */}
                  {expandedCategories.has(category.category) && (
                    <div className="p-4 border-t border-border bg-card">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {category.puzzleDetails.map((puzzle, pidx) => (
                          <div 
                            key={pidx}
                            className={`text-xs p-2 rounded flex items-center gap-2 ${
                              puzzle.solved 
                                ? 'bg-success/10 text-success border border-success/20' 
                                : 'bg-secondary/50 text-muted-foreground'
                            }`}
                            title={puzzle.puzzleName}
                          >
                            {puzzle.solved ? '✓' : '○'}
                            <span className="truncate">Puzzle {pidx + 1}</span>
                            {puzzle.attempts > 0 && (
                              <span className="ml-auto text-xs opacity-70">({puzzle.attempts})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default StudentDashboard;
