import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import PromotionDialog from '@/components/PromotionDialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, SkipBack, Save, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const BestGameEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const isEditMode = !!id;

  const [title, setTitle] = useState('');
  const [players, setPlayers] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'brilliant' | 'best' | 'blunder'>('best');
  const [moves, setMoves] = useState<string[]>([]);
  const [highlights, setHighlights] = useState<number[]>([]);
  const [game, setGame] = useState(new Chess());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [showPromotion, setShowPromotion] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<null | { from: string; to: string; gameCopy: Chess }>(null);

  useEffect(() => {
    if (isEditMode && id) {
      loadBestGame(id);
    }
  }, [id, isEditMode]);

  if (user?.role !== 'admin') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">You don't have access to this page.</p>
        </div>
      </AppLayout>
    );
  }

  const loadBestGame = async (gameId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bestgames/${gameId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const bestGame = await response.json();
        setTitle(bestGame.title);
        setPlayers(bestGame.players);
        setDescription(bestGame.description);
        setCategory(bestGame.category);
        setMoves(bestGame.moves || []);
        setHighlights(bestGame.highlights || []);
        
        // Replay moves on the board
        const newGame = new Chess();
        bestGame.moves?.forEach((move: string) => {
          newGame.move(move);
        });
        setGame(newGame);
        setCurrentMoveIndex(bestGame.moves?.length - 1 || -1);
      } else {
        // Try fallback: fetch all best games and match by slug/id
        const listResp = await fetch(`${API_BASE_URL}/bestgames`);
        if (listResp.ok) {
          const list: any[] = await listResp.json();
          const found = list.find(g => g._id === gameId || g.id === gameId);
          if (found) {
            setTitle(found.title);
            setPlayers(found.players);
            setDescription(found.description);
            setCategory(found.category);
            setMoves(found.moves || []);
            setHighlights(found.highlights || []);
            const newGame = new Chess();
            found.moves?.forEach((move: string) => newGame.move(move));
            setGame(newGame);
            setCurrentMoveIndex(found.moves?.length - 1 || -1);
            return;
          }
        }
        toast.error('Failed to load game');
      }
    } catch (error) {
      console.error('Load best game error:', error);
      toast.error('Error loading game');
    }
  };

  const handleSquareClick = (square: string) => {
    if (selectedSquare) {
      // Try to make a move
      try {
        const gameCopy = new Chess(game.fen());
        const mvVerbose = gameCopy.moves({ square: selectedSquare as Square, verbose: true }).find(m => m.to === square);
        if (mvVerbose && mvVerbose.promotion) {
          setPendingPromotion({ from: selectedSquare, to: square, gameCopy });
          setShowPromotion(true);
        } else {
          const move = game.move({ from: selectedSquare as Square, to: square as Square });
          if (move) {
            setMoves([...moves, move.san]);
            setGame(new Chess(game.fen()));
            setCurrentMoveIndex(moves.length);
            toast.success(`Move recorded: ${move.san}`);
          }
        }
      } catch (e) {
        toast.error('Invalid move');
      }
      setSelectedSquare(null);
    } else {
      // Select square if it has a piece of current turn
      const piece = game.get(square as Square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
      }
    }
  };

  const handlePromotionSelect = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    const { from, to, gameCopy } = pendingPromotion;
    try {
      const mv = gameCopy.move({ from: from as Square, to: to as Square, promotion: piece });
      if (mv) {
        setMoves(prev => [...prev, mv.san]);
        setGame(new Chess(gameCopy.fen()));
        setCurrentMoveIndex(moves.length);
        toast.success(`Move recorded: ${mv.san}`);
      }
    } catch (err) {
      toast.error('Invalid promotion move');
    }
    setPendingPromotion(null);
    setShowPromotion(false);
  };

  const undoLastMove = () => {
    if (moves.length === 0) return;
    
    const lastMoveIndex = moves.length - 1;
    const newMoves = moves.slice(0, -1);
    setMoves(newMoves);
    
    // Remove highlight if the last move was highlighted
    if (highlights.includes(lastMoveIndex)) {
      setHighlights(highlights.filter(h => h !== lastMoveIndex));
    }
    
    const newGame = new Chess();
    newMoves.forEach(move => {
      newGame.move(move);
    });
    setGame(newGame);
    setCurrentMoveIndex(newMoves.length - 1);
    setSelectedSquare(null);
    toast.success('Move removed');
  };

  const toggleHighlight = (index: number) => {
    if (highlights.includes(index)) {
      setHighlights(highlights.filter(h => h !== index));
    } else {
      setHighlights([...highlights, index]);
    }
  };

  const goToMove = (index: number) => {
    const newGame = new Chess();
    for (let i = 0; i <= index && i < moves.length; i++) {
      newGame.move(moves[i]);
    }
    setGame(newGame);
    setCurrentMoveIndex(index);
    setSelectedSquare(null);
  };

  const resetToStart = () => {
    setGame(new Chess());
    setCurrentMoveIndex(-1);
    setSelectedSquare(null);
  };

  const continueFromCurrent = () => {
    // User can continue adding moves from current position
    setSelectedSquare(null);
  };

  const saveBestGame = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title for the game');
      return;
    }
    if (!players.trim()) {
      toast.error('Please enter the players');
      return;
    }
    if (moves.length === 0) {
      toast.error('Please add at least one move');
      return;
    }

    const gameData = {
      title: title.trim(),
      players: players.trim(),
      description: description.trim(),
      category,
      moves,
      highlights,
      isEnabled: true,
    };

    try {
      const url = isEditMode
        ? `${API_BASE_URL}/bestgames/${id}`
        : `${API_BASE_URL}/bestgames`;
      
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(gameData),
      });

      if (response.ok) {
        toast.success(isEditMode ? 'Game updated successfully' : 'Game created successfully');
        navigate('/best-games');
      } else {
        toast.error('Failed to save game');
      }
    } catch (error) {
      console.error('Save best game error:', error);
      toast.error('Error saving game');
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/best-games')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            ← Back to best games
          </button>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
            {isEditMode ? 'Edit Best Game' : 'Add New Best Game'}
          </h1>
          <p className="text-muted-foreground">
            {isEditMode ? 'Modify the game details and moves' : 'Add a legendary game to your collection'}
          </p>
        </div>

        <div className="grid md:grid-cols-[1fr,400px] gap-6">
          {/* Left: Board and Controls */}
          <div className="space-y-4">
            <ChessBoard 
              game={game} 
              interactive={currentMoveIndex === moves.length - 1 || moves.length === 0}
              onSquareClick={handleSquareClick}
              selectedSquare={selectedSquare}
            />
            <PromotionDialog 
              open={showPromotion} 
              onOpenChange={setShowPromotion} 
              onSelect={handlePromotionSelect}
              color={(pendingPromotion && pendingPromotion.gameCopy.get(pendingPromotion.from)?.color) as 'w' | 'b' | undefined}
            />

            {/* Navigation Controls */}
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={resetToStart}
              >
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => currentMoveIndex > -1 && goToMove(currentMoveIndex - 1)}
                disabled={currentMoveIndex <= -1}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => currentMoveIndex < moves.length - 1 && goToMove(currentMoveIndex + 1)}
                disabled={currentMoveIndex >= moves.length - 1}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                onClick={continueFromCurrent}
                disabled={currentMoveIndex === moves.length - 1 || moves.length === 0}
              >
                Continue from here
              </Button>
            </div>

            {/* Instructions */}
            {(currentMoveIndex === moves.length - 1 || moves.length === 0) && (
              <div className="card-premium p-4">
                <p className="text-sm text-muted-foreground">
                  💡 Click on a piece, then click where to move it to record the move.
                </p>
              </div>
            )}
          </div>

          {/* Right: Game Info and Moves */}
          <div className="space-y-4">
            {/* Game Details Form */}
            <div className="card-premium p-5 space-y-4">
              <h3 className="font-medium">Game Details</h3>
              
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., The Immortal Game"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="players">Players *</Label>
                <Input
                  id="players"
                  placeholder="e.g., Anderssen vs Kieseritzky, 1851"
                  value={players}
                  onChange={(e) => setPlayers(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of why this game is notable"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={(value) => setCategory(value as any)}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brilliant">Brilliant</SelectItem>
                    <SelectItem value="best">Best</SelectItem>
                    <SelectItem value="blunder">Blunder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Move List */}
            <div className="card-premium p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Recorded Moves ({moves.length})</h3>
                {moves.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undoLastMove}
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Undo Last
                  </Button>
                )}
              </div>

              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {moves.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No moves recorded yet. Make moves on the board to add them.
                  </p>
                ) : (
                  <div className="grid grid-cols-[2rem,1fr,1fr] gap-x-2 gap-y-1 text-sm font-mono">
                    {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                      const whiteIndex = i * 2;
                      const blackIndex = i * 2 + 1;
                      return (
                        <>
                          <span key={`num-${i}`} className="text-muted-foreground py-1">{i + 1}.</span>
                          <button
                            key={`white-${i}`}
                            onClick={() => goToMove(whiteIndex)}
                            className={`text-left px-2 py-1 rounded flex items-center justify-between ${
                              currentMoveIndex === whiteIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                            }`}
                          >
                            <span>{moves[whiteIndex]}</span>
                            <Star
                              className={`w-3 h-3 cursor-pointer ${
                                highlights.includes(whiteIndex) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleHighlight(whiteIndex);
                              }}
                            />
                          </button>
                          {moves[blackIndex] && (
                            <button
                              key={`black-${i}`}
                              onClick={() => goToMove(blackIndex)}
                              className={`text-left px-2 py-1 rounded flex items-center justify-between ${
                                currentMoveIndex === blackIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                              }`}
                            >
                              <span>{moves[blackIndex]}</span>
                              <Star
                                className={`w-3 h-3 cursor-pointer ${
                                  highlights.includes(blackIndex) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHighlight(blackIndex);
                                }}
                              />
                            </button>
                          )}
                        </>
                      );
                    })}
                  </div>
                )}
              </div>

              {moves.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  💡 Click the star icon to highlight key moves
                </p>
              )}
            </div>

            {/* Save Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={saveBestGame}
              disabled={!title.trim() || !players.trim() || moves.length === 0}
            >
              <Save className="w-4 h-4 mr-2" />
              {isEditMode ? 'Update Game' : 'Create Game'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default BestGameEditor;
