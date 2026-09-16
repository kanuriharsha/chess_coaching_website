import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface ActivityRecord {
  type: 'page_visit' | 'puzzle_attempt' | 'puzzle_solved' | 'puzzle_failed' | 'opening_viewed' | 'game_viewed' | 'login' | 'logout';
  description: string;
  timestamp: string;
  duration?: number; // in seconds
  details?: {
    page?: string;
    puzzleId?: string;
    puzzleName?: string;
    puzzleNumber?: number; // 1-based puzzle index
    category?: string;
    attempts?: number;
    result?: 'passed' | 'failed';
    timeSpent?: number;
  };
}

export const useActivityTracker = () => {
  const { user, token } = useAuth();
  const pageStartTime = useRef<Date | null>(null);
  const currentPage = useRef<string>('');

  // Track page visit
  const trackPageVisit = useCallback(async (pageName: string) => {
    if (!user || !token || user.role === 'admin') return;

    // Record time spent on previous page
    if (pageStartTime.current && currentPage.current) {
      const timeSpent = Math.round((new Date().getTime() - pageStartTime.current.getTime()) / 1000);
      if (timeSpent > 5) { // Only track if spent more than 5 seconds
        await recordActivity({
          type: 'page_visit',
          description: `Spent ${formatDuration(timeSpent)} on ${currentPage.current}`,
          timestamp: pageStartTime.current.toISOString(),
          duration: timeSpent,
          details: {
            page: currentPage.current,
            timeSpent
          }
        });
      }
    }

    // Start tracking new page
    pageStartTime.current = new Date();
    currentPage.current = pageName;
  }, [user, token]);

  // Track puzzle attempt
  const trackPuzzleAttempt = useCallback(async (
    puzzleId: string,
    puzzleName: string,
    category: string,
    result: 'passed' | 'failed',
    attemptNumber: number,
    puzzleNumber?: number // Optional puzzle number (1-based index)
  ) => {
    if (!user || !token || user.role === 'admin') return;

    const now = new Date();
    const type = result === 'passed' ? 'puzzle_solved' : 'puzzle_failed';
    
    // Create clear description like "Completed Puzzle 1 - Back Rank Mate" or "Failed Puzzle 1"
    const puzzleLabel = puzzleNumber ? `Puzzle ${puzzleNumber}` : puzzleName;
    const description = result === 'passed' 
      ? `✅ Completed ${puzzleLabel}${puzzleName !== puzzleLabel ? ` (${puzzleName})` : ''} in ${category}`
      : `❌ Failed ${puzzleLabel}${puzzleName !== puzzleLabel ? ` (${puzzleName})` : ''} in ${category} (Attempt ${attemptNumber})`;

    await recordActivity({
      type,
      description,
      timestamp: now.toISOString(),
      details: {
        puzzleId,
        puzzleName,
        puzzleNumber,
        category,
        attempts: attemptNumber,
        result
      }
    });
  }, [user, token]);

  // Track opening viewed
  const trackOpeningViewed = useCallback(async (openingName: string, category: string) => {
    if (!user || !token || user.role === 'admin') return;

    await recordActivity({
      type: 'opening_viewed',
      description: `Studied opening: ${openingName} (${category})`,
      timestamp: new Date().toISOString(),
      details: {
        page: 'Openings',
        category
      }
    });
  }, [user, token]);

  // Track best game viewed
  const trackGameViewed = useCallback(async (gameTitle: string, category: string) => {
    if (!user || !token || user.role === 'admin') return;

    await recordActivity({
      type: 'game_viewed',
      description: `Watched best game: ${gameTitle}`,
      timestamp: new Date().toISOString(),
      details: {
        page: 'Best Games',
        category
      }
    });
  }, [user, token]);

  // Record activity to backend
  const recordActivity = async (activity: ActivityRecord) => {
    if (!user || !token) return;

    try {
      await fetch(`${API_BASE_URL}/users/${user.id}/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(activity)
      });
    } catch (error) {
      console.error('Failed to record activity:', error);
    }
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds} sec`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return secs > 0 ? `${mins} min ${secs} sec` : `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours} hr ${remainingMins} min`;
  };

  // Track page leave
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pageStartTime.current && currentPage.current && user && token) {
        const timeSpent = Math.round((new Date().getTime() - pageStartTime.current.getTime()) / 1000);
        if (timeSpent > 5) {
          // Use sendBeacon with Blob for reliable tracking on page unload
          // Note: sendBeacon doesn't support custom headers, so we include token in body
          const data = JSON.stringify({
            type: 'page_visit',
            description: `Spent ${formatDuration(timeSpent)} on ${currentPage.current}`,
            timestamp: pageStartTime.current.toISOString(),
            duration: timeSpent,
            details: {
              page: currentPage.current,
              timeSpent
            },
            _token: token // Include token in body for beacon endpoint
          });
          const blob = new Blob([data], { type: 'application/json' });
          navigator.sendBeacon(
            `${API_BASE_URL}/users/${user.id}/activity/beacon`,
            blob
          );
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user, token]);

  return {
    trackPageVisit,
    trackPuzzleAttempt,
    trackOpeningViewed,
    trackGameViewed
  };
};

export default useActivityTracker;
