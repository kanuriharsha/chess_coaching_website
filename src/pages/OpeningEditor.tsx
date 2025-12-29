import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import ChessBoard from '@/components/ChessBoard';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, SkipBack, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Move {
  san: string;
  comment?: string;
  evaluation?: 'best' | 'brilliant' | 'good' | 'inaccuracy';
}

const OpeningEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isEditMode = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Open Games');
  const [moves, setMoves] = useState<Move[]>([]);
  const [game, setGame] = useState(new Chess());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [moveComment, setMoveComment] = useState('');
  const [moveEvaluation, setMoveEvaluation] = useState<'best' | 'brilliant' | 'good' | 'inaccuracy' | ''>('');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  useEffect(() => {
    if (isEditMode && id) {
      loadOpening(id);
    }
  }, [id, isEditMode]);

  const loadOpening = async (openingId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/openings/${openingId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const opening = await response.json();
        setName(opening.name);
        setDescription(opening.description);
        setCategory(opening.category);
        setMoves(opening.moves || []);
        
        // Replay moves on the board
        const newGame = new Chess();
        opening.moves?.forEach((move: Move) => {
          newGame.move(move.san);
        });
        setGame(newGame);
        setCurrentMoveIndex(opening.moves?.length - 1 || -1);
      } else {
        toast.error('Failed to load opening');
      }
    } catch (error) {
      console.error('Load opening error:', error);
      toast.error('Error loading opening');
    }
  };

  const handleSquareClick = (square: string) => {
    if (selectedSquare) {
      // Try to make a move
      try {
        const move = game.move({
          from: selectedSquare as Square,
          to: square as Square,
          promotion: 'q',
        });
        if (move) {
          const newMove: Move = {
            san: move.san,
            comment: moveComment || undefined,
            evaluation: moveEvaluation || undefined,
          };
          setMoves([...moves, newMove]);
          setGame(new Chess(game.fen()));
          setCurrentMoveIndex(moves.length);
          setMoveComment('');
          setMoveEvaluation('');
          toast.success(`Move recorded: ${move.san}`);
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

  const undoLastMove = () => {
    if (moves.length === 0) return;
    
    const newMoves = moves.slice(0, -1);
    setMoves(newMoves);
    
    const newGame = new Chess();
    newMoves.forEach(move => {
      newGame.move(move.san);
    });
    setGame(newGame);
    setCurrentMoveIndex(newMoves.length - 1);
    setSelectedSquare(null);
    toast.success('Move removed');
  };

  const goToMove = (index: number) => {
    const newGame = new Chess();
    for (let i = 0; i <= index && i < moves.length; i++) {
      newGame.move(moves[i].san);
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

  const saveOpening = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name for the opening');
      return;
    }
    if (moves.length === 0) {
      toast.error('Please add at least one move');
      return;
    }

    const openingData = {
      name: name.trim(),
      description: description.trim(),
      category,
      moves,
      isEnabled: true,
    };

    try {
      const url = isEditMode
        ? `${API_BASE_URL}/openings/${id}`
        : `${API_BASE_URL}/openings`;
      
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(openingData),
      });

      if (response.ok) {
        toast.success(isEditMode ? 'Opening updated successfully' : 'Opening created successfully');
        navigate('/openings');
      } else {
        toast.error('Failed to save opening');
      }
    } catch (error) {
      console.error('Save opening error:', error);
      toast.error('Error saving opening');
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/openings')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            ← Back to openings
          </button>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
            {isEditMode ? 'Edit Opening' : 'Create New Opening'}
          </h1>
          <p className="text-muted-foreground">
            {isEditMode ? 'Modify the opening details and moves' : 'Add a new opening to your collection'}
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

            {/* Move Comment and Evaluation */}
            {(currentMoveIndex === moves.length - 1 || moves.length === 0) && (
              <div className="card-premium p-4 space-y-3">
                <h3 className="font-medium text-sm">Next Move Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="move-comment" className="text-xs">Comment (optional)</Label>
                  <Input
                    id="move-comment"
                    placeholder="e.g., Control the center with the king pawn"
                    value={moveComment}
                    onChange={(e) => setMoveComment(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="move-evaluation" className="text-xs">Evaluation (optional)</Label>
                  <Select value={moveEvaluation} onValueChange={(value) => setMoveEvaluation(value as any)}>
                    <SelectTrigger id="move-evaluation">
                      <SelectValue placeholder="Select evaluation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">None</SelectItem>
                      <SelectItem value="brilliant">Brilliant</SelectItem>
                      <SelectItem value="best">Best</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="inaccuracy">Inaccuracy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Click on a piece, then click where to move it. The move will be recorded with the details above.
                </p>
              </div>
            )}
          </div>

          {/* Right: Opening Info and Moves */}
          <div className="space-y-4">
            {/* Opening Details Form */}
            <div className="card-premium p-5 space-y-4">
              <h3 className="font-medium">Opening Details</h3>
              
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Italian Game"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the opening"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open Games">Open Games</SelectItem>
                    <SelectItem value="Semi-Open Games">Semi-Open Games</SelectItem>
                    <SelectItem value="Closed Games">Closed Games</SelectItem>
                    <SelectItem value="Semi-Closed Games">Semi-Closed Games</SelectItem>
                    <SelectItem value="Flank Openings">Flank Openings</SelectItem>
                    <SelectItem value="Indian Defenses">Indian Defenses</SelectItem>
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

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {moves.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No moves recorded yet. Make moves on the board to add them.
                  </p>
                ) : (
                  moves.map((move, index) => (
                    <button
                      key={index}
                      onClick={() => goToMove(index)}
                      className={`
                        w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all
                        ${
                          currentMoveIndex === index
                            ? 'bg-primary/10 border border-primary'
                            : 'hover:bg-secondary border border-transparent'
                        }
                      `}
                    >
                      <span className="w-6 h-6 flex items-center justify-center text-xs font-mono text-muted-foreground">
                        {Math.floor(index / 2) + 1}.{index % 2 === 0 ? '' : '..'}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{move.san}</span>
                          {move.evaluation && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              move.evaluation === 'brilliant' ? 'bg-brilliant text-brilliant-foreground' :
                              move.evaluation === 'best' ? 'bg-success text-success-foreground' :
                              move.evaluation === 'good' ? 'bg-primary text-primary-foreground' :
                              'bg-warning text-warning-foreground'
                            }`}>
                              {move.evaluation}
                            </span>
                          )}
                        </div>
                        {move.comment && (
                          <p className="text-xs text-muted-foreground mt-1">{move.comment}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Save Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={saveOpening}
              disabled={!name.trim() || moves.length === 0}
            >
              <Save className="w-4 h-4 mr-2" />
              {isEditMode ? 'Update Opening' : 'Create Opening'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default OpeningEditor;
