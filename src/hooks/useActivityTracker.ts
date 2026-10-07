import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface ActivityRecord {
  type: 'puzzle_attempt' | 'puzzle_solved' | 'puzzle_failed' | 'login' | 'logout';
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
    attemptId?: string;
    result?: 'passed' | 'failed';
    timeSpent?: number;
  };
}

export const useActivityTracker = () => {
  const { user, token } = useAuth();
  const pageStartTime = useRef<Date | null>(null);
  const currentPage = useRef<string>('');

  // Page visit tracking is intentionally disabled; do not record 'page_visit' events.
  const trackPageVisit = useCallback(async (_pageName: string) => {
    return;
  }, []);

  // Track puzzle attempt
  const trackPuzzleAttempt = useCallback(async (
    puzzleId: string,
    puzzleName: string,
    category: string,
    result: 'passed' | 'failed',
    attemptNumber: number,
    attemptId?: string,
    puzzleNumber?: number // Optional puzzle number (1-based index)
  ) => {
    if (!user || !token || isAdminRole(user.role)) return;

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
        attemptId: attemptId || crypto.randomUUID(),
        result
      }
    });
  }, [user, token]);

  // Opening and best-game view tracking are intentionally disabled; do not record these activity events.
  const trackOpeningViewed = useCallback(async (_openingName: string, _category: string) => {
    return;
  }, []);

  const trackGameViewed = useCallback(async (_gameTitle: string, _category: string) => {
    return;
  }, []);

  // Record activity to backend
  const recordActivity = async (activity: ActivityRecord) => {
    if (!user || !token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/users/${user.id}/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(activity)
      });
      if (!response.ok) {
        throw new Error(`Activity request failed with status ${response.status}`);
      }
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

  // Page leave tracking is intentionally disabled; do not record 'page_visit' events.
  useEffect(() => {
    return undefined;
  }, [user, token]);

  return {
    trackPageVisit,
    trackPuzzleAttempt,
    trackOpeningViewed,
    trackGameViewed
  };
};

export default useActivityTracker;
