import { useState, useCallback, useEffect } from 'react';
import { Chess, Square } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveGame, LiveGame } from '@/hooks/useLiveGame';
import { Flag, Clock, User, RotateCcw, Handshake, X } from 'lucide-react';
import { toast } from 'sonner';
import { useChessSound } from '@/hooks/useChessSound';
import { Button } from '@/components/ui/button';
import PromotionDialog from '@/components/PromotionDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LiveChessGameProps {
  game: LiveGame;
  onLeave: () => void;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const LiveChessGame = ({ game: initialGame, onLeave }: LiveChessGameProps) => {
  const { user } = useAuth();
  const { makeMove, resign, offerDraw } = useLiveGame();
  const { playSound } = useChessSound();
  
  // Keep local game state that updates from socket events
  const [activeGame, setActiveGame] = useState<LiveGame>(initialGame);
  
  const [chess, setChess] = useState(() => new Chess(initialGame.fen));
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [showResignDialog, setShowResignDialog] = useState(false);
  const [drawOffered, setDrawOffered] = useState(false);
  const [showDrawOffer, setShowDrawOffer] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState('');
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<null | { from: Square; to: Square; chessCopy: Chess }>(null);

  // Determine player color
  const isWhite = activeGame.white.id === user?.id;
  const playerColor: 'white' | 'black' = isWhite ? 'white' : 'black';
  const opponentName = isWhite ? activeGame.black.username : activeGame.white.username;

  // Listen for socket events directly in this component
  useEffect(() => {
    const handleMoveReceived = (data: { gameId: string; move: string; fen: string; whiteTime: number; blackTime: number; turn: 'w' | 'b' }) => {
      console.log('🎯 LiveChessGame received move:', data);
      if (data.gameId === activeGame.id) {
        setActiveGame(prev => ({
          ...prev,
          fen: data.fen,
          moves: [...prev.moves, data.move],
          whiteTime: data.whiteTime,
          blackTime: data.blackTime,
          turn: data.turn,
          lastMoveAt: new Date().toISOString()
        }));
      }
    };

    const handleTimeUpdate = (data: { gameId: string; whiteTime: number; blackTime: number; turn: 'w' | 'b' }) => {
      if (data.gameId === activeGame.id) {
        setActiveGame(prev => ({
          ...prev,
          whiteTime: data.whiteTime,
          blackTime: data.blackTime,
          turn: data.turn
        }));
      }
    };

    const handleGameEnded = (data: { gameId: string; result: 'white' | 'black' | 'draw'; reason: string }) => {
      console.log('🏁 LiveChessGame received game ended:', data);
      if (data.gameId === activeGame.id) {
        setActiveGame(prev => ({
          ...prev,
          status: 'finished',
          result: data.result,
          resultReason: data.reason
        }));
      }
    };

    // Import and set up socket listeners
    import('@/services/socketService').then(({ default: socketService }) => {
      console.log('🎧 LiveChessGame setting up socket listeners for game:', activeGame.id);
      socketService.on('game:move', handleMoveReceived);
      socketService.on('game:time-update', handleTimeUpdate);
      socketService.on('game:ended', handleGameEnded);
    });

    return () => {
      import('@/services/socketService').then(({ default: socketService }) => {
        socketService.off('game:move', handleMoveReceived);
        socketService.off('game:time-update', handleTimeUpdate);
        socketService.off('game:ended', handleGameEnded);
      });
    };
  }, [activeGame.id]);

  // Update chess board when game FEN changes
  useEffect(() => {
    const gameFen = activeGame.fen;
    if (gameFen && gameFen !== chess.fen()) {
      console.log('🔄 Updating board with new FEN:', gameFen);
      const newChess = new Chess(gameFen);
      setChess(newChess);
      
      // Extract last move from moves array
      if (activeGame.moves && activeGame.moves.length > 0) {
        const lastMoveStr = activeGame.moves[activeGame.moves.length - 1];
        if (lastMoveStr && lastMoveStr.length >= 4) {
          const from = lastMoveStr.substring(0, 2) as Square;
          const to = lastMoveStr.substring(2, 4) as Square;
          setLastMove({ from, to });
        }
      }
      
      // Play sound based on game state
      if (newChess.isCheckmate()) {
        playSound('checkmate');
      } else if (newChess.isCheck()) {
        playSound('check');
      } else {
        playSound('move');
      }
    }
  }, [activeGame.fen, activeGame.moves]);

  // Handle draw offer received
  useEffect(() => {
    const handleDrawOffer = (data: { gameId: string; from: string }) => {
      if (data.gameId === activeGame.id) {
        setShowDrawOffer(true);
        setDrawOfferFrom(data.from);
      }
    };

    // Listen for draw offers via socket service
    import('@/services/socketService').then(({ default: socketService }) => {
      socketService.on('game:draw-offered', handleDrawOffer);
      return () => socketService.off('game:draw-offered', handleDrawOffer);
    });
  }, [activeGame.id]);

  // Handle game end
  useEffect(() => {
    if (activeGame.status === 'finished' && activeGame.result) {
      const isWinner = 
        (activeGame.result === 'white' && isWhite) || 
        (activeGame.result === 'black' && !isWhite);
      
      if (activeGame.result === 'draw') {
        toast.info(`Game ended in a DRAW by ${activeGame.resultReason}!`);
      } else if (isWinner) {
        toast.success(`🎉 ${activeGame.result.toUpperCase()} WINS! You won by ${activeGame.resultReason}!`, {
          duration: 10000
        });
        playSound('checkmate');
      } else {
        toast.error(`${activeGame.result.toUpperCase()} WINS! You lost by ${activeGame.resultReason}`, {
          duration: 10000
        });
      }
      
      console.log(`🏁 Game Over: ${activeGame.result.toUpperCase()} WINS by ${activeGame.resultReason}`);
    }
  }, [activeGame.status, activeGame.result, activeGame.resultReason]);

  const handleMove = useCallback(
    (from: Square, to: Square): boolean => {
      // Check if game is still active
      if (activeGame.status !== 'active') {
        toast.error('Game has ended');
        return false;
      }

      // Check if it's player's turn
      const isPlayerTurn =
        (playerColor === 'white' && chess.turn() === 'w') ||
        (playerColor === 'black' && chess.turn() === 'b');

      if (!isPlayerTurn) {
        toast.error("Not your turn!");
        return false;
      }

      const chessCopy = new Chess(chess.fen());
      // If this move requires promotion, open chooser instead of auto-promoting
      const moveVerbose = chessCopy.moves({ square: from, verbose: true }).find(m => m.to === to);
      if (moveVerbose && moveVerbose.promotion && !moveVerbose.promotion) {
        // should not happen, but guard
      }

      if (moveVerbose && moveVerbose.promotion) {
        setPendingPromotion({ from, to, chessCopy });
        setShowPromotionDialog(true);
        return false; // handled after selection
      }

      const move = chessCopy.move({ from, to });

      if (move) {
        setChess(chessCopy);
        setLastMove({ from, to });

        // Send move to server with the new FEN
        makeMove(from, to, move.promotion, chessCopy.fen());
        
        // Play sound and check game end conditions
        if (chessCopy.isCheckmate()) {
          playSound('checkmate');
          // Notify server about checkmate
          import('@/services/socketService').then(({ default: socketService }) => {
            socketService.emit('game:checkmate', { gameId: activeGame.id });
          });
        } else if (chessCopy.isStalemate()) {
          // Only stalemate, not other draw conditions
          import('@/services/socketService').then(({ default: socketService }) => {
            socketService.emit('game:stalemate', { gameId: activeGame.id });
          });
        } else if (chessCopy.isCheck()) {
          playSound('check');
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
    [chess, playerColor, makeMove, playSound, activeGame.id, activeGame.status]
  );

  const handleResign = () => {
    resign();
    setShowResignDialog(false);
  };

  const handleOfferDraw = () => {
    offerDraw();
    setDrawOffered(true);
    toast.info('Draw offer sent');
  };

  const handleAcceptDraw = () => {
    import('@/services/socketService').then(({ default: socketService }) => {
      socketService.emit('game:accept-draw', { gameId: activeGame.id });
    });
    setShowDrawOffer(false);
  };

  const handleDeclineDraw = () => {
    setShowDrawOffer(false);
    toast.info('Draw offer declined');
  };

  const handlePromotionSelect = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    const { from, to, chessCopy } = pendingPromotion;
    try {
      const mv = chessCopy.move({ from, to, promotion: piece });
      if (mv) {
        setChess(chessCopy);
        setLastMove({ from, to });
        makeMove(from, to, mv.promotion, chessCopy.fen());
        // Play promoted sound
        playSound('promote');
      }
    } catch (err) {
      toast.error('Invalid promotion move');
    }
    setPendingPromotion(null);
    setShowPromotionDialog(false);
  };

  const whiteTime = activeGame.whiteTime;
  const blackTime = activeGame.blackTime;
  const isGameOver = activeGame.status === 'finished';

  // Debug timer values
  useEffect(() => {
    console.log('⏰ Timer values updated:', { whiteTime, blackTime, turn: chess.turn() });
  }, [whiteTime, blackTime]);

  return (
    <div className="animate-fade-in">
      <div className="grid md:grid-cols-[1fr,300px] gap-6">
        {/* Board */}
        <div className="relative">
          {/* Opponent Timer (top) */}
          <div className={`mb-3 flex items-center justify-between p-3 rounded-lg ${
            isWhite 
              ? (chess.turn() === 'b' && !isGameOver ? 'bg-primary/20 border-2 border-primary' : 'bg-secondary')
              : (chess.turn() === 'w' && !isGameOver ? 'bg-primary/20 border-2 border-primary' : 'bg-secondary')
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isWhite ? 'bg-foreground text-background' : 'bg-card border-2'
              }`}>
                {isWhite ? '♚' : '♔'}
              </div>
              <span className="font-medium">{opponentName}</span>
            </div>
            <div className={`text-2xl font-mono font-bold ${
              (isWhite ? blackTime : whiteTime) < 60 ? 'text-destructive animate-pulse' : ''
            }`}>
              <Clock className="w-4 h-4 inline mr-2" />
              {formatTime(isWhite ? blackTime : whiteTime)}
            </div>
          </div>

          <ChessBoard
            game={chess}
            onMove={handleMove}
            orientation={playerColor}
            lastMove={lastMove}
          />

          {/* Player Timer (bottom) */}
          <div className={`mt-3 flex items-center justify-between p-3 rounded-lg ${
            isWhite 
              ? (chess.turn() === 'w' && !isGameOver ? 'bg-primary/20 border-2 border-primary' : 'bg-secondary')
              : (chess.turn() === 'b' && !isGameOver ? 'bg-primary/20 border-2 border-primary' : 'bg-secondary')
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isWhite ? 'bg-card border-2' : 'bg-foreground text-background'
              }`}>
                {isWhite ? '♔' : '♚'}
              </div>
              <span className="font-medium">{user?.username} (You)</span>
            </div>
            <div className={`text-2xl font-mono font-bold ${
              (isWhite ? whiteTime : blackTime) < 60 ? 'text-destructive animate-pulse' : ''
            }`}>
              <Clock className="w-4 h-4 inline mr-2" />
              {formatTime(isWhite ? whiteTime : blackTime)}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Game Info */}
          <div className="card-premium p-4">
            <h3 className="font-serif font-semibold mb-3">Live Game</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode:</span>
                <span className="capitalize">{activeGame.mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time Control:</span>
                <span>{Math.floor(activeGame.timeControl.initial / 60)} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your Color:</span>
                <span className="capitalize">{playerColor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className={`capitalize ${isGameOver ? 'text-muted-foreground' : 'text-success'}`}>
                  {isGameOver ? 'Finished' : 'Active'}
                </span>
              </div>
            </div>
          </div>

          {/* Game Result */}
          {isGameOver && activeGame.result && (
            <div className={`card-premium p-4 border-2 ${
              activeGame.result === 'draw' 
                ? 'bg-muted border-muted-foreground'
                : ((activeGame.result === 'white' && isWhite) || (activeGame.result === 'black' && !isWhite))
                  ? 'bg-success/20 border-success'
                  : 'bg-destructive/20 border-destructive'
            }`}>
              <h3 className="font-serif font-semibold mb-3 text-center text-xl">
                🏁 Game Over
              </h3>
              
              {activeGame.result === 'draw' ? (
                <>
                  <p className="text-2xl font-bold text-center mb-2">
                    DRAW
                  </p>
                  <p className="text-center text-muted-foreground capitalize">
                    by {activeGame.resultReason}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-center mb-2">
                    {activeGame.result.toUpperCase()} WINS!
                  </p>
                  <p className="text-lg text-center mb-2">
                    {((activeGame.result === 'white' && isWhite) || (activeGame.result === 'black' && !isWhite))
                      ? '🎉 You Won!'
                      : '😔 You Lost'}
                  </p>
                  <p className="text-center text-sm capitalize">
                    Victory by {activeGame.resultReason}
                  </p>
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-center text-muted-foreground">
                      Winner: {activeGame.result === 'white' ? activeGame.white.username : activeGame.black.username}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Controls */}
          {!isGameOver ? (
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleOfferDraw}
                disabled={drawOffered}
              >
                <Handshake className="w-4 h-4 mr-2" />
                {drawOffered ? 'Draw Offered' : 'Offer Draw'}
              </Button>
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setShowResignDialog(true)}
              >
                <Flag className="w-4 h-4 mr-2" />
                Resign
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={onLeave}>
              <X className="w-4 h-4 mr-2" />
              Leave Game
            </Button>
          )}
        </div>
      </div>

      {/* Resign Confirmation Dialog */}
      <PromotionDialog 
        open={showPromotionDialog} 
        onOpenChange={setShowPromotionDialog} 
        onSelect={handlePromotionSelect}
        color={(pendingPromotion && game.get(pendingPromotion.from)?.color) as 'w' | 'b' | undefined}
      />
      
      <AlertDialog open={showResignDialog} onOpenChange={setShowResignDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resign Game?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to resign? This will count as a loss.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResign} className="bg-destructive">
              Resign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Draw Offer Dialog */}
      <AlertDialog open={showDrawOffer} onOpenChange={setShowDrawOffer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Draw Offered</AlertDialogTitle>
            <AlertDialogDescription>
              {drawOfferFrom} is offering a draw. Do you accept?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeclineDraw}>Decline</AlertDialogCancel>
            <AlertDialogAction onClick={handleAcceptDraw}>Accept Draw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LiveChessGame;
