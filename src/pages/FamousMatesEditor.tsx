import React, { useState, useEffect } from 'react';
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
import { ChevronLeft, ChevronRight, SkipBack, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Move {
  san: string;
  comment?: string;
  evaluation?: 'best' | 'brilliant' | 'good' | 'inaccuracy';
}

const FamousMatesEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const isEditMode = !!id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Famous Mates');
  const [moves, setMoves] = useState<Move[]>([]);
  const [game, setGame] = useState(new Chess());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [moveComment, setMoveComment] = useState('');
  const [moveEvaluation, setMoveEvaluation] = useState<'best' | 'brilliant' | 'good' | 'inaccuracy' | ''>('');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [showPromotion, setShowPromotion] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<null | { from: string; to: string; gameCopy: Chess }>(null);

  useEffect(() => {
    if (isEditMode && id) {
      loadFamousMate(id);
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

  const loadFamousMate = async (mateId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/mates/${mateId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const famousMate = await response.json();
        setName(famousMate.name);
        setDescription(famousMate.description);
        setCategory(famousMate.category);
        setMoves(famousMate.moves || []);
        
        // Replay moves on the board
        const newGame = new Chess();
        famousMate.moves?.forEach((move: Move) => {
          newGame.move(move.san);
        });
        setGame(newGame);
        setCurrentMoveIndex(famousMate.moves?.length - 1 || -1);
      } else {
        // Fallback: fetch list and try to match by slug/id
        const listResp = await fetch(`${API_BASE_URL}/famous-mates`);
        if (listResp.ok) {
          const list: any[] = await listResp.json();
          const found = list.find(o => o._id === mateId || o.id === mateId);
          if (found) {
            setName(found.name);
            setDescription(found.description);
            setCategory(found.category);
            setMoves(found.moves || []);
            const newGame = new Chess();
            found.moves?.forEach((m: any) => newGame.move(m.san || m));
            setGame(newGame);
            setCurrentMoveIndex(found.moves?.length - 1 || -1);
            return;
          }
        }
        toast.error('Failed to load famous mate');
      }
    } catch (error) {
      console.error('Load famous mate error:', error);
      toast.error('Error loading famous mate');
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
        const newMove: Move = { san: mv.san, comment: moveComment || undefined, evaluation: moveEvaluation || undefined };
        setMoves(prev => [...prev, newMove]);
        setGame(new Chess(gameCopy.fen()));
        setCurrentMoveIndex(moves.length);
        setMoveComment('');
        setMoveEvaluation('');
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

  const saveFamousMate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name for the famous mate');
      return;
    }
    if (moves.length === 0) {
      toast.error('Please add at least one move');
      return;
    }

    const famousMateData = {
      name: name.trim(),
      description: description.trim(),
      category,
      moves,
      isEnabled: true,
    };

    try {
      const url = isEditMode
        ? `${API_BASE_URL}/famous-mates/${id}`
        : `${API_BASE_URL}/famous-mates`;
      
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(famousMateData),
      });

      if (response.ok) {
        toast.success(isEditMode ? 'mate updated successfully' : 'mate created successfully');
        navigate('/famous-mates');
      } else {
        toast.error('Failed to save famous mate');
      }
    } catch (error) {
      console.error('Save famous mate error:', error);
      toast.error('Error saving famous mate');
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/mates')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            ← Back to mates
          </button>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
            {isEditMode ? 'Edit mate' : 'Create New mate'}
          </h1>
          <p className="text-muted-foreground">
            {isEditMode ? 'Modify the mate details and moves' : 'Add a new mate to your collection'}
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
color={(pendingPromotion && pendingPromotion.gameCopy.get(pendingPromotion.from as Square)?.color) as 'w' | 'b' | undefined}
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

          {/* Right: mate Info and Moves */}
          <div className="space-y-4">
            {/* mate Details Form */}
            <div className="card-premium p-5 space-y-4">
              <h3 className="font-medium">mate Details</h3>
              
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Fool's Mate"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the famous mate"
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
                    <SelectItem value="Famous Mates">Famous Mates</SelectItem>
                    <SelectItem value="Quick Mates">Quick Mates</SelectItem>
                    <SelectItem value="Back Rank Mates">Back Rank Mates</SelectItem>
                    <SelectItem value="Smothered Mates">Smothered Mates</SelectItem>
                    <SelectItem value="Other Mates">Other Mates</SelectItem>
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
                  <div>
                    <div className="grid grid-cols-[2rem,1fr,1fr] gap-x-2 gap-y-1 text-sm font-mono mb-2">
                      <div className="text-muted-foreground">#</div>
                      <div className="font-medium">White</div>
                      <div className="font-medium">Black</div>
                    </div>
                    <div className="grid grid-cols-[2rem,1fr,1fr] gap-x-2 gap-y-1 text-sm font-mono">
                      {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                        const whiteIndex = i * 2;
                        const blackIndex = i * 2 + 1;
                        const whiteMove = moves[whiteIndex];
                        const blackMove = moves[blackIndex];
                        return (
                          <React.Fragment key={`move-pair-${i}`}>
                            <div className="text-muted-foreground py-1">{i + 1}.</div>

                            <button
                              key={`white-${i}`}
                              onClick={() => goToMove(whiteIndex)}
                              className={`text-left px-2 py-1 rounded flex items-center justify-between ${
                                currentMoveIndex === whiteIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                              }`}
                            >
                              <div>
                                <div className="font-mono font-medium">{whiteMove?.san}</div>
                                {whiteMove?.comment && <div className="text-xs text-muted-foreground">{whiteMove.comment}</div>}
                              </div>
                              {whiteMove?.evaluation && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                                  whiteMove.evaluation === 'brilliant' ? 'bg-brilliant text-brilliant-foreground' :
                                  whiteMove.evaluation === 'best' ? 'bg-success text-success-foreground' :
                                  whiteMove.evaluation === 'good' ? 'bg-primary text-primary-foreground' :
                                  'bg-warning text-warning-foreground'
                                }`}>
                                  {whiteMove.evaluation}
                                </span>
                              )}
                            </button>

                            {blackMove ? (
                              <button
                                key={`black-${i}`}
                                onClick={() => goToMove(blackIndex)}
                                className={`text-left px-2 py-1 rounded flex items-center justify-between ${
                                  currentMoveIndex === blackIndex ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
                                }`}
                              >
                                <div>
                                  <div className="font-mono font-medium">{blackMove.san}</div>
                                  {blackMove.comment && <div className="text-xs text-muted-foreground">{blackMove.comment}</div>}
                                </div>
                                {blackMove.evaluation && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                                    blackMove.evaluation === 'brilliant' ? 'bg-brilliant text-brilliant-foreground' :
                                    blackMove.evaluation === 'best' ? 'bg-success text-success-foreground' :
                                    blackMove.evaluation === 'good' ? 'bg-primary text-primary-foreground' :
                                    'bg-warning text-warning-foreground'
                                  }`}>
                                    {blackMove.evaluation}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <div key={`black-empty-${i}`} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={saveFamousMate}
              disabled={!name.trim() || moves.length === 0}
            >
              <Save className="w-4 h-4 mr-2" />
              {isEditMode ? 'Update mate' : 'Create mate'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default FamousMatesEditor;
