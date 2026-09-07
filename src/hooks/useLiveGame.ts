import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import socketService from '@/services/socketService';

export interface GameRequest {
  id: string;
  from: {
    id: string;
    username: string;
  };
  to: {
    id: string;
    username: string;
  };
  mode: 'normal' | 'friendly';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
}

export interface LiveGame {
  id: string;
  white: {
    id: string;
    username: string;
  };
  black: {
    id: string;
    username: string;
  };
  fen: string;
  moves: string[];
  mode: 'normal' | 'friendly';
  timeControl: {
    initial: number; // in seconds
    increment: number; // in seconds
  };
  whiteTime: number; // remaining time in seconds
  blackTime: number; // remaining time in seconds
  turn: 'w' | 'b';
  status: 'waiting' | 'active' | 'finished';
  result?: 'white' | 'black' | 'draw';
  resultReason?: string;
  startedAt?: string;
  lastMoveAt?: string;
}

export const useLiveGame = () => {
  const { user, token } = useAuth();
  const [gameRequests, setGameRequests] = useState<GameRequest[]>([]);
  const [pendingRequest, setPendingRequest] = useState<GameRequest | null>(null);
  const [currentGame, setCurrentGame] = useState<LiveGame | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const listenersSetup = useRef(false);

  // Connect to socket when component mounts
  useEffect(() => {
    if (token) {
      console.log('🔗 Attempting socket connection...');
      socketService.connect(token)
        .then(() => {
          console.log('✅ Socket connected successfully');
          setIsConnected(true);
        })
        .catch((err) => {
          console.error('❌ Failed to connect:', err);
          setIsConnected(false);
        });

      // Also listen for reconnection
      const unsubscribe = socketService.onConnect(() => {
        console.log('🔄 Socket reconnected, updating state');
        setIsConnected(true);
      });

      return () => {
        unsubscribe();
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [token]);

  // Listen for socket events - setup immediately but handlers check connection
  useEffect(() => {
    // Game request received (for admin/coach)
    const handleGameRequest = (request: GameRequest) => {
      console.log('📩 Game request received:', request);
      setGameRequests(prev => {
        // Avoid duplicates
        if (prev.some(r => r.id === request.id)) return prev;
        return [...prev, request];
      });
    };

    // Game request response (for student)
    const handleRequestResponse = (response: { requestId: string; status: 'accepted' | 'declined'; game?: LiveGame }) => {
      console.log('📨 Request response:', response);
      if (response.status === 'accepted' && response.game) {
        setPendingRequest(null);
        setCurrentGame(response.game);
      } else if (response.status === 'declined') {
        setPendingRequest(null);
      }
    };

    // Game started
    const handleGameStarted = (game: LiveGame) => {
      console.log('🎮 Game started:', game);
      setCurrentGame(game);
      setGameRequests(prev => prev.filter(r => r.id !== game.id));
    };

    // Move made
    const handleMoveMade = (data: { gameId: string; move: string; fen: string; whiteTime: number; blackTime: number; turn: 'w' | 'b' }) => {
      console.log('♟️ Move made received:', data);
      setCurrentGame(prev => {
        if (prev && prev.id === data.gameId) {
          return {
            ...prev,
            fen: data.fen,
            moves: [...prev.moves, data.move],
            whiteTime: data.whiteTime,
            blackTime: data.blackTime,
            turn: data.turn,
            lastMoveAt: new Date().toISOString()
          };
        }
        return prev;
      });
    };

    // Time update
    const handleTimeUpdate = (data: { gameId: string; whiteTime: number; blackTime: number }) => {
      console.log('⏱️ Time update received:', data);
      setCurrentGame(prev => {
        if (prev && prev.id === data.gameId) {
          return {
            ...prev,
            whiteTime: data.whiteTime,
            blackTime: data.blackTime
          };
        }
        return prev;
      });
    };

    // Game ended
    const handleGameEnded = (data: { gameId: string; result: 'white' | 'black' | 'draw'; reason: string }) => {
      console.log('🏁 Game ended:', data);
      setCurrentGame(prev => {
        if (prev && prev.id === data.gameId) {
          return {
            ...prev,
            status: 'finished',
            result: data.result,
            resultReason: data.reason
          };
        }
        return prev;
      });
    };

    // Request cancelled
    const handleRequestCancelled = (data: { requestId: string }) => {
      setGameRequests(prev => prev.filter(r => r.id !== data.requestId));
      setPendingRequest(prev => prev?.id === data.requestId ? null : prev);
    };

    // Request sent confirmation (for student)
    const handleRequestSent = (data: { requestId: string }) => {
      console.log('📤 Game request sent, ID:', data.requestId);
      setPendingRequest(prev => prev ? { ...prev, id: data.requestId } : null);
    };

    console.log('🎧 Setting up socket listeners...');
    socketService.on('game:request', handleGameRequest);
    socketService.on('game:request-sent', handleRequestSent);
    socketService.on('game:request-response', handleRequestResponse);
    socketService.on('game:started', handleGameStarted);
    socketService.on('game:move', handleMoveMade);
    socketService.on('game:time-update', handleTimeUpdate);
    socketService.on('game:ended', handleGameEnded);
    socketService.on('game:request-cancelled', handleRequestCancelled);

    return () => {
      console.log('🧹 Cleaning up socket listeners...');
      socketService.off('game:request', handleGameRequest);
      socketService.off('game:request-sent', handleRequestSent);
      socketService.off('game:request-response', handleRequestResponse);
      socketService.off('game:started', handleGameStarted);
      socketService.off('game:move', handleMoveMade);
      socketService.off('game:time-update', handleTimeUpdate);
      socketService.off('game:ended', handleGameEnded);
      socketService.off('game:request-cancelled', handleRequestCancelled);
    };
  }, []); // Run once on mount - socketService handles reconnection internally

  // Send game request (student to coach)
  const sendGameRequest = useCallback((mode: 'normal' | 'friendly', targetAdminId?: string) => {
    if (!user) {
      console.error('❌ Cannot send request: No user');
      return;
    }
    
    console.log('📤 Sending game request:', { mode, targetAdminId, isSocketConnected: socketService.isConnected() });
    
    const request: Partial<GameRequest> = {
      from: { id: user.id, username: user.username },
      mode,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    socketService.emit('game:request-send', { mode, targetAdminId });
    setPendingRequest(request as GameRequest);
  }, [user]);

  // Cancel game request
  const cancelGameRequest = useCallback(() => {
    if (pendingRequest) {
      socketService.emit('game:request-cancel', { requestId: pendingRequest.id });
      setPendingRequest(null);
    }
  }, [pendingRequest]);

  // Accept game request (coach)
  const acceptGameRequest = useCallback((requestId: string, timeControl: { initial: number; increment: number }) => {
    socketService.emit('game:request-accept', { requestId, timeControl });
  }, []);

  // Decline game request (coach)
  const declineGameRequest = useCallback((requestId: string) => {
    socketService.emit('game:request-decline', { requestId });
    setGameRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  // Make a move
  const makeMove = useCallback((from: string, to: string, promotion?: string, fen?: string) => {
    if (!currentGame) return;
    const payload = {
      gameId: currentGame.id,
      from,
      to,
      promotion,
      fen
    };
    // Primary event (new clients)
    socketService.emit('game:make-move', payload);
    // Also emit compatibility events so older/alternate clients and server mappings receive the move
    socketService.emit('game:move', payload);
    socketService.emit('move', { from, to, promotion, fen });
  }, [currentGame]);

  // Resign
  const resign = useCallback(() => {
    if (!currentGame) return;
    socketService.emit('game:resign', { gameId: currentGame.id });
  }, [currentGame]);

  // Offer draw
  const offerDraw = useCallback(() => {
    if (!currentGame) return;
    socketService.emit('game:offer-draw', { gameId: currentGame.id });
  }, [currentGame]);

  // Leave game (cleanup)
  const leaveGame = useCallback(() => {
    if (currentGame) {
      socketService.emit('game:leave', { gameId: currentGame.id });
    }
    setCurrentGame(null);
  }, [currentGame]);

  return {
    isConnected,
    gameRequests,
    pendingRequest,
    currentGame,
    sendGameRequest,
    cancelGameRequest,
    acceptGameRequest,
    declineGameRequest,
    makeMove,
    resign,
    offerDraw,
    leaveGame
  };
};

export default useLiveGame;
