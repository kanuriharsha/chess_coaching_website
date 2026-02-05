import React, { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
import { 
  Flame, 
  Target, 
  Trophy, 
  TrendingUp, 
  Calendar,
  Puzzle,
  ChevronRight,
  Star
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

// Mock data - in production this would come from backend
const generateWeeklyData = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((day, index) => ({
    day,
    puzzles: Math.floor(Math.random() * 15) + 5,
    accuracy: Math.floor(Math.random() * 25) + 70,
    timeSpent: Math.floor(Math.random() * 40) + 20,
  }));
};

const recommendedPuzzles = [
  { id: 1, title: 'Knight Fork Practice', category: 'Forks', difficulty: 'Intermediate', rating: 1200 },
  { id: 2, title: 'Back Rank Mate', category: 'Mate in 1', difficulty: 'Beginner', rating: 800 },
  { id: 3, title: 'Pin the Queen', category: 'Pins', difficulty: 'Intermediate', rating: 1100 },
  { id: 4, title: 'Discovered Attack', category: 'Other', difficulty: 'Advanced', rating: 1400 },
];

interface PuzzleProgress {
  category: string;
  totalPuzzles: number;
  solvedPuzzles: number;
  puzzleDetails: {
    puzzleId: string;
    puzzleName: string;
    solved: boolean;
    solvedAt?: string;
    attempts: number;
  }[];
}

const StudentDashboard: React.FC = () => {
  const { user, token } = useAuth();
  const { trackPageVisit } = useActivityTracker();
  const [weeklyData, setWeeklyData] = useState(() => generateWeeklyData());
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalPuzzlesSolved, setTotalPuzzlesSolved] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(50);
  const [weeklyProgress, setWeeklyProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [puzzleProgress, setPuzzleProgress] = useState<PuzzleProgress[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Track page visit
  useEffect(() => {
    trackPageVisit('Dashboard');
  }, []);

  // Fetch real student activity and progress
  useEffect(() => {
    const loadData = async () => {
      if (!user || !token) return;
      setIsLoading(true);

      try {
        // Fetch activities (last 1000)
        const actRes = await fetch(`${API_BASE_URL}/users/${user.id}/activity?limit=1000`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const activities = actRes.ok ? await actRes.json() : [];

        // Fetch puzzle progress
        const progressRes = await fetch(`${API_BASE_URL}/users/${user.id}/puzzle-progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const progress = progressRes.ok ? await progressRes.json() : [];
        setPuzzleProgress(progress);

        // Fetch attendance for streaks
        const attendRes = await fetch(`${API_BASE_URL}/users/${user.id}/attendance`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const attendance = attendRes.ok ? await attendRes.json() : [];

        // Compute total solved from progress
        const totalSolved = progress.reduce((acc: number, cat: any) => acc + (cat.solvedPuzzles || 0), 0);
        setTotalPuzzlesSolved(totalSolved);

        // Compute weekly arrays for last 7 days (ending today)
        const now = new Date();
        const days = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(now);
          d.setDate(now.getDate() - (6 - i));
          d.setHours(0, 0, 0, 0);
          return d;
        });

        const dayStats = days.map((day) => ({
          dayLabel: day.toLocaleDateString(undefined, { weekday: 'short' }),
          puzzles: 0,
          accuracy: 0,
          timeSpent: 0
        }));

        // Group activities by day and compute metrics
        const byDay: Record<string, any> = {};
        activities.forEach((a: any) => {
          const t = new Date(a.timestamp);
          t.setHours(0, 0, 0, 0);
          const key = t.toISOString();
          if (!byDay[key]) byDay[key] = { solved: 0, failed: 0, attempts: 0, timeSpent: 0 };
          if (a.type === 'puzzle_solved') byDay[key].solved++;
          if (a.type === 'puzzle_failed') byDay[key].failed++;
          if (a.type === 'puzzle_attempt') byDay[key].attempts++;
          if (a.details?.timeSpent) byDay[key].timeSpent += a.details.timeSpent;
        });

        dayStats.forEach((ds, idx) => {
          const key = days[idx].toISOString();
          const v = byDay[key] || { solved: 0, failed: 0, attempts: 0, timeSpent: 0 };
          const attempts = v.solved + v.failed + v.attempts;
          const accuracy = attempts > 0 ? Math.round((v.solved / attempts) * 100) : 0;
          ds.puzzles = attempts;
          ds.accuracy = accuracy;
          ds.timeSpent = v.timeSpent;
        });

        setWeeklyData(dayStats.map(d => ({ day: d.dayLabel, puzzles: d.puzzles, accuracy: d.accuracy, timeSpent: d.timeSpent })));

        // Compute totals for week
        const totalPuzzlesThisWeek = dayStats.reduce((acc, d) => acc + d.puzzles, 0);
        const totalTimeThisWeek = dayStats.reduce((acc, d) => acc + d.timeSpent, 0);
        setWeeklyProgress(totalPuzzlesThisWeek);

        // Average accuracy across week
        const avgAcc = dayStats.length ? Math.round(dayStats.reduce((acc, d) => acc + d.accuracy, 0) / dayStats.length) : 0;

        // Compute streaks from attendance (or fallback to activity days)
        const attendedDays = new Set(attendance.map((a: any) => {
          const d = new Date(a.date);
          d.setHours(0,0,0,0);
          return d.toISOString();
        }));

        // If attendance missing, use activity days
        if (attendedDays.size === 0) {
          Object.keys(byDay).forEach(k => attendedDays.add(k));
        }

        // Calculate current streak and longest streak from the last 60 days
        const streakWindow = 60;
        let cur = 0;
        let best = 0;
        for (let i = 0; i < streakWindow; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          d.setHours(0,0,0,0);
          if (attendedDays.has(d.toISOString())) {
            cur++;
            best = Math.max(best, cur);
          } else {
            cur = 0;
          }
        }
        setCurrentStreak(cur);
        setLongestStreak(best);

        // set other derived values in state
        setWeeklyGoal(prev => prev);
        setTotalPuzzlesSolved(totalSolved);
        setIsLoading(false);

      } catch (err) {
        console.error('Load dashboard data error', err);
        setIsLoading(false);
      }
    };

    loadData();
  }, [user, token]);

  // Calculate category accuracy from user activity
  const categoryAccuracy = useMemo(() => {
    const accuracyByCategory: { [key: string]: { correct: number; total: number; accuracy: number } } = {};
    
    // We'll fetch activity to calculate accuracy
    // For now, calculate from puzzleProgress puzzleDetails
    puzzleProgress.forEach(category => {
      const attempted = category.puzzleDetails.filter(p => p.attempts > 0);
      const correct = attempted.filter(p => p.solved);
      accuracyByCategory[category.category] = {
        correct: correct.length,
        total: attempted.length,
        accuracy: attempted.length > 0 ? Math.round((correct.length / attempted.length) * 100) : 0
      };
    });
    
    return accuracyByCategory;
  }, [puzzleProgress]);

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

  // Calculate stats derived for rendering
  const avgAccuracy = Math.round(weeklyData.reduce((acc, d) => acc + d.accuracy, 0) / (weeklyData.length || 1));
  const totalPuzzlesThisWeek = weeklyData.reduce((acc, d) => acc + d.puzzles, 0);
  const totalTimeThisWeek = weeklyData.reduce((acc, d) => acc + d.timeSpent, 0);

  const formatMinutes = (mins: number) => {
    if (!mins || mins <= 0) return '0m';
    const hours = Math.floor(mins / 60);
    const minutes = Math.round(mins % 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-warning/20 rounded-lg">
              <Flame className={`w-6 h-6 ${currentStreak > 0 ? 'text-warning animate-pulse' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-2xl font-bold text-foreground">{currentStreak}</p>
                <p className="text-xs text-muted-foreground">Day Streak</p>
              </div>
            </div>
            <div className="text-center px-4 py-2 bg-secondary rounded-lg">
              <p className="text-lg font-bold text-foreground">{longestStreak}</p>
              <p className="text-xs text-muted-foreground">Best Streak</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="card-premium">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Puzzle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalPuzzlesSolved}</p>
                <p className="text-xs text-muted-foreground">Total Solved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="card-premium">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{avgAccuracy}%</p>
                <p className="text-xs text-muted-foreground">Avg. Accuracy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="card-premium">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalPuzzlesThisWeek}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="card-premium">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{formatMinutes(totalTimeThisWeek)}</p>
                <p className="text-xs text-muted-foreground">Time Spent</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Goal Progress */}
      <Card className="card-premium">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-serif">Weekly Goal</CardTitle>
            <span className="text-sm text-muted-foreground">
              {weeklyProgress} / {weeklyGoal} puzzles
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={(weeklyProgress / weeklyGoal) * 100} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            {weeklyGoal - weeklyProgress > 0 
              ? `${weeklyGoal - weeklyProgress} more puzzles to reach your weekly goal!`
              : '🎉 Congratulations! You reached your weekly goal!'}
          </p>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Progress Chart */}
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Puzzles This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="puzzleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="day" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="puzzles"
                    stroke="hsl(var(--primary))"
                    fill="url(#puzzleGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Accuracy Chart */}
        <Card className="card-premium">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Accuracy Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="day" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis 
                    domain={[50, 100]}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value}%`, 'Accuracy']}
                  />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="hsl(var(--success))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--success))', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommended Puzzles */}
      <Card className="card-premium">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Star className="w-5 h-5 text-warning" />
              Recommended for You
            </CardTitle>
            <a href="/puzzles" className="text-sm text-primary hover:underline">
              View All
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {recommendedPuzzles.map((puzzle) => (
              <div
                key={puzzle.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
              >
                <div className="flex-1">
                  <p className="font-medium text-foreground text-sm">{puzzle.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {puzzle.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {puzzle.difficulty}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Puzzle Progress by Category */}
      {puzzleProgress.length > 0 && (
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
                    
                    {/* Accuracy Display */}
                    {categoryAccuracy[category.category] && categoryAccuracy[category.category].total > 0 && (
                      <div className="p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-blue-900 dark:text-blue-100 font-medium">Accuracy:</span>
                          <span className={`font-bold ${
                            categoryAccuracy[category.category].accuracy >= 80 ? 'text-success' :
                            categoryAccuracy[category.category].accuracy >= 60 ? 'text-warning' :
                            'text-destructive'
                          }`}>
                            {categoryAccuracy[category.category].accuracy}%
                          </span>
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          {categoryAccuracy[category.category].correct} correct / {categoryAccuracy[category.category].total} attempted
                        </div>
                      </div>
                    )}
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

      {/* Daily Streak Calendar */}
      <Card className="card-premium">
        <CardHeader>
          <CardTitle className="text-lg font-serif">This Week's Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between gap-2">
            {weeklyData.map((day, index) => {
              const isToday = index === 6; // Assuming last day is today
              const hasActivity = day.puzzles > 0;
              
              return (
                <div key={day.day} className="flex-1 text-center">
                  <p className="text-xs text-muted-foreground mb-2">{day.day}</p>
                  <div
                    className={`
                      aspect-square rounded-lg flex items-center justify-center
                      ${hasActivity 
                        ? 'bg-primary/20 border-2 border-primary' 
                        : 'bg-secondary border-2 border-transparent'}
                      ${isToday ? 'ring-2 ring-warning ring-offset-2 ring-offset-background' : ''}
                    `}
                  >
                    {hasActivity && (
                      <span className="text-xs font-medium text-primary">{day.puzzles}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentDashboard;
