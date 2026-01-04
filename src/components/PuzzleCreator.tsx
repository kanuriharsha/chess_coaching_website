import React, { useState, useCallback, useEffect } from 'react';
import VisualBoardEditor from './VisualBoardEditor';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { Trash2, Save, Eye, EyeOff, Edit3 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface PuzzleData {
  _id?: string;
  name: string;
  category: string;
  description: string;
  fen: string;
  solution: string[];
  hint: string;
  difficulty: 'easy' | 'medium' | 'hard';
  icon: string;
  isEnabled: boolean;
}

const PUZZLE_CATEGORIES = [
  { id: 'mate-in-1', name: 'Mate in 1' },
  { id: 'mate-in-2', name: 'Mate in 2' },
  { id: 'mate-in-3', name: 'Mate in 3' },
  { id: 'mate-in-4', name: 'Mate in 4' },
  { id: 'mate-in-5', name: 'Mate in 5' },
  { id: 'pins', name: 'Pins' },
  { id: 'forks', name: 'Forks' },
  { id: 'traps', name: 'Traps' },
  { id: 'other', name: 'Other Tactics' },
];

const DIFFICULTY_LEVELS = [
  { id: 'easy', name: 'Easy' },
  { id: 'medium', name: 'Medium' },
  { id: 'hard', name: 'Hard' },
];

const PIECE_ICONS = [
  { icon: '♔', name: 'King' },
  { icon: '♕', name: 'Queen' },
  { icon: '♖', name: 'Rook' },
  { icon: '♗', name: 'Bishop' },
  { icon: '♘', name: 'Knight' },
  { icon: '♙', name: 'Pawn' },
];

interface PuzzleCreatorProps { editPuzzleId?: string }

const PuzzleCreator: React.FC<PuzzleCreatorProps> = ({ editPuzzleId }) => {
  const { token } = useAuth();
  const [puzzles, setPuzzles] = useState<PuzzleData[]>([]);
  const [showPuzzleList, setShowPuzzleList] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [newPuzzle, setNewPuzzle] = useState<PuzzleData>({
    name: '',
    category: '',
    description: '',
    fen: '',
    solution: [],
    hint: '',
    difficulty: 'medium',
    icon: '♔',
    isEnabled: true
  });

  // Load puzzles from API
  const loadPuzzles = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPuzzles(data);
      }
    } catch (error) {
      console.error('Failed to load puzzles');
    }
  }, [token]);

  // Load puzzles on mount
  React.useEffect(() => {
    loadPuzzles();
  }, [loadPuzzles]);

  // If PuzzleManager forwarded an editPuzzleId, load that puzzle when puzzles are available
  useEffect(() => {
    if (editPuzzleId && puzzles.length > 0) {
      const p = puzzles.find(x => x._id === editPuzzleId);
      if (p) {
        handleEditPuzzle(p);
      }
    }
  }, [editPuzzleId, puzzles]);

  const handleEditPuzzle = (p: PuzzleData) => {
    setNewPuzzle({ ...p });
    setShowPuzzleList(false);
  };

  const handleSavePuzzle = async () => {
    if (!newPuzzle.name.trim()) {
      toast.error('Please enter a puzzle title');
      return;
    }
    if (!newPuzzle.category) {
      toast.error('Please select a category');
      return;
    }
    if (!newPuzzle.difficulty) {
      toast.error('Please select a difficulty level');
      return;
    }
    if (!newPuzzle.fen) {
      toast.error('Please set up the position and save it');
      return;
    }
    if (newPuzzle.solution.length === 0) {
      toast.error('Please record at least one solution move');
      return;
    }

    setIsLoading(true);
    try {
      const isEdit = !!newPuzzle._id;
      const url = isEdit ? `${API_BASE_URL}/puzzles/${newPuzzle._id}` : `${API_BASE_URL}/puzzles`;
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newPuzzle)
      });

      if (response.ok) {
        toast.success(isEdit ? 'Puzzle updated successfully!' : 'Puzzle created successfully!');
        setNewPuzzle({
          name: '',
          category: '',
          description: '',
          fen: '',
          solution: [],
          hint: '',
          difficulty: 'medium',
          icon: '♔',
          isEnabled: true
        });
        loadPuzzles();
      } else {
        const text = await response.text();
        console.error('Save puzzle failed:', text);
        toast.error('Failed to save puzzle');
      }
    } catch (error) {
      console.error('Save puzzle error:', error);
      toast.error('Failed to save puzzle');
    }
    setIsLoading(false);
  };

  const handleDeletePuzzle = async (id: string) => {
    if (!confirm('Are you sure you want to delete this puzzle?')) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        toast.success('Puzzle deleted');
        loadPuzzles();
      }
    } catch (error) {
      toast.error('Failed to delete puzzle');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Create Puzzles</h2>
          <p className="text-muted-foreground">Visually create chess puzzles by placing pieces and recording solutions</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowPuzzleList(!showPuzzleList)}
        >
          {showPuzzleList ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
          {showPuzzleList ? 'Create New' : 'View Puzzles'} ({puzzles.length})
        </Button>
      </div>

      {showPuzzleList ? (
        // Puzzle List View
        <div className="space-y-4">
          {puzzles.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No puzzles created yet. Create your first puzzle!
              </CardContent>
            </Card>
          ) : (
            puzzles.map(puzzle => (
              <Card key={puzzle._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{puzzle.icon}</span>
                      <div>
                        <h3 className="font-semibold text-foreground">{puzzle.name}</h3>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">
                            {PUZZLE_CATEGORIES.find(c => c.id === puzzle.category)?.name || puzzle.category}
                          </span>
                          <span className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded">
                            {puzzle.difficulty}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${puzzle.isEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {puzzle.isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">
                          Solution: {puzzle.solution.join(' → ')}
                        </p>
                        {puzzle.hint && (
                          <p className="text-sm text-muted-foreground">Hint: {puzzle.hint}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditPuzzle(puzzle)}
                        className="text-foreground hover:text-foreground"
                        title="Edit puzzle"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePuzzle(puzzle._id!)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        // Creator View - Single column layout
        <div className="space-y-6">
          {/* Visual Board Editor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Visual Board Editor</CardTitle>
              <p className="text-sm text-muted-foreground">
                Select a piece below the board, then click on the board to place it. Click same piece again to remove.
              </p>
            </CardHeader>
            <CardContent>
              <VisualBoardEditor
                initialFen={newPuzzle.fen}
                initialSolution={newPuzzle.solution}
                initialMode={newPuzzle.solution && newPuzzle.solution.length > 0 ? 'solution' : 'setup'}
                onPositionSave={(fen, solution) => {
                  setNewPuzzle({ ...newPuzzle, fen, solution });
                }}
              />
              {newPuzzle.fen && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <strong className="text-green-700">✓ Position & Solution saved!</strong><br/>
                  <span className="text-green-600">Solution moves: <span className="font-medium">{newPuzzle.solution.join(' → ') || 'None'}</span></span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Puzzle Details - Grid layout */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Puzzle Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Puzzle Title *</Label>
                  <Input
                    id="title"
                    value={newPuzzle.name}
                    onChange={(e) => setNewPuzzle({ ...newPuzzle, name: e.target.value })}
                    placeholder="e.g., Scholar's Mate"
                  />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={newPuzzle.category} onValueChange={(value) => setNewPuzzle({ ...newPuzzle, category: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {PUZZLE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Difficulty */}
                <div className="space-y-2">
                  <Label>Difficulty *</Label>
                  <Select value={newPuzzle.difficulty} onValueChange={(value: 'easy' | 'medium' | 'hard') => setNewPuzzle({ ...newPuzzle, difficulty: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTY_LEVELS.map(level => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Icon */}
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Select value={newPuzzle.icon} onValueChange={(value) => setNewPuzzle({ ...newPuzzle, icon: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIECE_ICONS.map(p => (
                        <SelectItem key={p.icon} value={p.icon}>
                          {p.icon} {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Hint */}
                <div className="space-y-2">
                  <Label htmlFor="hint">Hint (Optional)</Label>
                  <Input
                    id="hint"
                    value={newPuzzle.hint}
                    onChange={(e) => setNewPuzzle({ ...newPuzzle, hint: e.target.value })}
                    placeholder="e.g., Look at the weak f7 square"
                  />
                </div>

                {/* Description - Full width */}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={newPuzzle.description}
                    onChange={(e) => setNewPuzzle({ ...newPuzzle, description: e.target.value })}
                    placeholder="Describe the puzzle..."
                    rows={2}
                  />
                </div>

                {/* Save Button - Full width */}
                <div className="sm:col-span-2">
                  <Button 
                    onClick={handleSavePuzzle} 
                    className="w-full" 
                    size="lg"
                    disabled={isLoading || !newPuzzle.fen}
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Puzzle to Database
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PuzzleCreator;
