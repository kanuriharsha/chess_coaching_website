import { useState, useCallback, useEffect } from 'react';
import { Chess, Square } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import LiveChessGame from '@/components/LiveChessGame';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveGame } from '@/hooks/useLiveGame';
import { Monitor, User, RotateCcw, Flag, ArrowLeftRight, Loader2, X, Clock, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useChessSound } from '@/hooks/useChessSound';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { Button } from '@/components/ui/button';

type GameMode = 'normal' | 'friendly';
type Opponent = 'computer' | 'coach';

interface Admin {
  _id: string;
  username: string;
  role: string;
  isEnabled: boolean;
}

const Games = () => {
  const { user, token } = useAuth();
  const [game, setGame] = useState(new Chess());
  const [gameStarted, setGameStarted] = useState(false);
  const [opponent, setOpponent] = useState<Opponent>('computer');
  const [gameMode, setGameMode] = useState<GameMode>('normal');
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const { playSound } = useChessSound();
  const { trackPageVisit } = useActivityTracker();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<string | null>(null);

  // Live game hook
  const {
    isConnected,
    pendingRequest,
    currentGame,
    sendGameRequest,
    cancelGameRequest,
    leaveGame
  } = useLiveGame();

  // Track page visit
  useEffect(() => {
    trackPageVisit('Games');
  }, []);

  // Fetch admins when coach is selected
  useEffect(() => {
    if (opponent === 'coach') {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      console.log('📡 Fetching coaches from:', `${apiUrl}/coaches`);
      fetch(`${apiUrl}/coaches`)
        .then(res => {
          console.log('📡 Coaches response status:', res.status);
          return res.json();
        })
        .then(data => {
          console.log('📡 Coaches data:', data);
          setAdmins(data);
          if (data.length > 0) setSelectedAdmin(data[0]._id);
        })
        .catch(err => console.error('Failed to fetch coaches:', err));
    }
  }, [opponent]);

  const handleMove = useCallback(
    (from: Square, to: Square): boolean => {
      const isPlayerTurn =
        (playerColor === 'white' && game.turn() === 'w') ||
        (playerColor === 'black' && game.turn() === 'b');

      if (!isPlayerTurn) return false;

      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({ from, to, promotion: 'q' });

      if (move) {
        setGame(gameCopy);
        setLastMove({ from, to });
        setMoveHistory((prev) => [...prev, move.san]);

        // Play appropriate sound
        if (gameCopy.isCheckmate()) {
          playSound('checkmate');
          toast.success('Checkmate! 🎉');
        } else if (gameCopy.isCheck()) {
          playSound('check');
          toast('Check!');
        } else if (gameCopy.isDraw()) {
          toast.info('Draw!');
        } else if (move.captured) {
          playSound('capture');
        } else if (move.flags.includes('k') || move.flags.includes('q')) {
          playSound('castle');
        } else {
          playSound('move');
        }

        return true;
      }
      return false;
    },
    [game, playerColor, playSound]
  );

  // Computer move
  useEffect(() => {
    if (!gameStarted || opponent !== 'computer') return;

    const isComputerTurn =
      (playerColor === 'white' && game.turn() === 'b') ||
      (playerColor === 'black' && game.turn() === 'w');

    if (isComputerTurn && !game.isGameOver()) {
      const timer = setTimeout(() => {
        const moves = game.moves({ verbose: true });
        if (moves.length > 0) {
          const randomMove = moves[Math.floor(Math.random() * moves.length)];
          const gameCopy = new Chess(game.fen());
          gameCopy.move(randomMove);
          setGame(gameCopy);
          setLastMove({ from: randomMove.from, to: randomMove.to });
          setMoveHistory((prev) => [...prev, randomMove.san]);

          // Play appropriate sound for computer move
          if (gameCopy.isCheckmate()) {
            playSound('checkmate');
            toast.error('Checkmate! Better luck next time.');
          } else if (gameCopy.isCheck()) {
            playSound('check');
          } else if (randomMove.captured) {
            playSound('capture');
          } else if (randomMove.flags.includes('k') || randomMove.flags.includes('q')) {
            playSound('castle');
          } else {
            playSound('move');
          }
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [game, gameStarted, opponent, playerColor, playSound]);

  const startGame = () => {
    if (opponent === 'coach') {
      // Send game request to coach
      sendGameRequest(gameMode, selectedAdmin);
      toast.info('Game request sent to coach. Waiting for response...', {
        duration: 5000
      });
    } else {
      // Start computer game
      setGame(new Chess());
      setGameStarted(true);
      setLastMove(null);
      setMoveHistory([]);
      toast.success('Game started! Good luck!');
    }
  };

  const resetGame = () => {
    setGame(new Chess());
    setGameStarted(false);
    setLastMove(null);
    setMoveHistory([]);
  };

  const flipBoard = () => {
    setPlayerColor((prev) => (prev === 'white' ? 'black' : 'white'));
  };

  const resign = () => {
    toast.info('You resigned. Better luck next time!');
    resetGame();
  };

  const handleCancelRequest = () => {
    cancelGameRequest();
    toast.info('Game request cancelled');
  };

  const handleLeaveGame = () => {
    leaveGame();
  };

  // If there's an active live game with coach, show that
  if (currentGame) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <div className="mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
              Live Game vs Coach
            </h1>
            <p className="text-muted-foreground">
              Play in real-time with your coach
            </p>
          </div>
          <LiveChessGame game={currentGame} onLeave={handleLeaveGame} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
            Games
          </h1>
          <p className="text-muted-foreground">
            Practice against the computer or play with your coach
          </p>
          {/* Connection Status */}
          {opponent === 'coach' && (
            <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full text-sm ${
              isConnected ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
            }`}>
              {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {isConnected ? 'Connected' : 'Connecting...'}
            </div>
          )}
        </div>

        <div className="max-w-md mx-auto mt-6">
          <div className="card-premium p-6 text-center">
            <h3 className="font-serif text-lg font-semibold mb-2">Play with Coach</h3>
            <p className="text-sm text-muted-foreground mb-4">Click the button below to be redirected to the live coach play site.</p>
            <a
              href="https://harshachessplay.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-premium w-full inline-block"
            >
              Play with coach
            </a>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Games;
