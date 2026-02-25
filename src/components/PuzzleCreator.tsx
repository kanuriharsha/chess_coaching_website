import React, { useState, useCallback, useEffect } from 'react';
import VisualBoardEditor from './VisualBoardEditor';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { Trash2, Save, Eye, EyeOff, Edit3, GripVertical, ArrowLeft, Plus, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from './ui/dialog';

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
  preloadedMove?: string; // Optional move to execute automatically before student plays
  successMessage?: string; // Custom success message when puzzle is solved (default: "Checkmate! Brilliant move!")
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

const DEFAULT_PUZZLE_CATEGORIES = [...PUZZLE_CATEGORIES];

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
  const [isRearrangeMode, setIsRearrangeMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [tempReorderedPuzzles, setTempReorderedPuzzles] = useState<PuzzleData[]>([]);
  const [selectedPuzzleIndex, setSelectedPuzzleIndex] = useState<number | null>(null);
  
  // Custom categories
  const [customCategories, setCustomCategories] = useState<Array<{id: string, name: string, description?: string, icon?: string}>>([]);
  const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('🎯');
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const [newPuzzle, setNewPuzzle] = useState<PuzzleData>({
    name: '',
    category: '',
    description: '',
    fen: '',
    solution: [],
    hint: '',
    difficulty: 'medium',
    icon: '♔',
    isEnabled: true,
    preloadedMove: '',
    successMessage: 'Checkmate! Brilliant move!'
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
    loadCustomCategories();
  }, [loadPuzzles]);

  // Load custom categories from API (server-side - consistent across all browsers)
  const loadCustomCategories = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzle-categories`);
      if (response.ok) {
        const data = await response.json();
        // Map server response (uses categoryId field) to the {id, name, ...} shape
        setCustomCategories(data.map((c: any) => ({ id: c.categoryId, name: c.name, description: c.description, icon: c.icon })));
      }
    } catch (error) {
      console.error('Failed to load custom categories');
    }
  };

  // Add new custom category (saves to server)
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('Please enter a category name');
      return;
    }
    
    const categoryId = newCategoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const allCats = [...DEFAULT_PUZZLE_CATEGORIES, ...customCategories];
    
    if (allCats.some(cat => cat.id === categoryId)) {
      toast.error('This category already exists');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/puzzle-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          categoryId,
          name: newCategoryName.trim(),
          description: newCategoryDescription.trim() || 'Custom puzzle category',
          icon: newCategoryIcon || '🎯'
        })
      });
      if (response.ok) {
        toast.success(`Category "${newCategoryName.trim()}" added!`);
        setNewCategoryName('');
        setNewCategoryDescription('');
        setNewCategoryIcon('🎯');
        setShowAddCategoryDialog(false);
        loadCustomCategories();
      } else {
        const err = await response.json();
        toast.error(err.message || 'Failed to add category');
      }
    } catch (error) {
      toast.error('Failed to add category');
    }
  };

  // Delete custom category (removes from server, also deletes its puzzles)
  const handleDeleteCategory = async (categoryId: string) => {
    const categoryPuzzles = puzzles.filter(p => p.category === categoryId);
    if (categoryPuzzles.length > 0) {
      const confirmed = window.confirm(`This will also delete ${categoryPuzzles.length} puzzle(s) in this category. Continue?`);
      if (!confirmed) return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/puzzle-categories/${categoryId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        toast.success('Category deleted');
        loadCustomCategories();
        loadPuzzles();
      } else {
        const err = await response.json();
        toast.error(err.message || 'Failed to delete category');
      }
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  // Get all categories (default + custom)
  const allCategories = [...DEFAULT_PUZZLE_CATEGORIES, ...customCategories];

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
          isEnabled: true,
          preloadedMove: '',
          successMessage: 'Checkmate! Brilliant move!'
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

  // Get active color from FEN (whose turn it is)
  const getActiveColorFromFEN = (fen: string): 'white' | 'black' => {
    if (!fen) return 'white';
    const parts = fen.split(' ');
    return parts[1] === 'b' ? 'black' : 'white';
  };

  // Handle drag start
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    setDragOverIndex(index);
    
    const newPuzzles = [...(tempReorderedPuzzles.length > 0 ? tempReorderedPuzzles : filteredPuzzles)];
    const draggedPuzzle = newPuzzles[draggedIndex];
    newPuzzles.splice(draggedIndex, 1);
    newPuzzles.splice(index, 0, draggedPuzzle);
    
    setTempReorderedPuzzles(newPuzzles);
    setDraggedIndex(index);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Save the new puzzle order to backend
  const saveRearrangedOrder = async () => {
    try {
      const puzzlesToSave = tempReorderedPuzzles.length > 0 ? tempReorderedPuzzles : filteredPuzzles;
      const puzzleOrders = puzzlesToSave.map((puzzle, index) => ({
        id: puzzle._id,
        order: index
      }));

      const response = await fetch(`${API_BASE_URL}/puzzles/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ puzzleOrders })
      });

      if (response.ok) {
        toast.success('Puzzle order saved successfully!');
        setIsRearrangeMode(false);
        setTempReorderedPuzzles([]);
        loadPuzzles();
      } else {
        toast.error('Failed to save puzzle order');
      }
    } catch (error) {
      console.error('Save order error:', error);
      toast.error('Failed to save puzzle order');
    }
  };

  // Filter puzzles based on search query and category filter
  const filteredPuzzles = React.useMemo(() => {
    return puzzles.filter(puzzle => {
      // Category filter
      const matchesCategory = categoryFilter === 'all' || puzzle.category === categoryFilter;
      
      // Search filter (case-insensitive, prefix and partial matching)
      // Search in both puzzle name and solution moves
      const matchesSearch = searchQuery === '' || 
        puzzle.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        puzzle.solution.join(' ').toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesCategory && matchesSearch;
    });
  }, [puzzles, searchQuery, categoryFilter]);

  // Initialize temp reordered puzzles when entering rearrange mode or category changes
  React.useEffect(() => {
    if (isRearrangeMode) {
      setTempReorderedPuzzles([...filteredPuzzles]);
      setSelectedPuzzleIndex(null);
    } else {
      setTempReorderedPuzzles([]);
      setSelectedPuzzleIndex(null);
    }
  }, [isRearrangeMode, categoryFilter, filteredPuzzles]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRearrangeMode || selectedPuzzleIndex === null) return;
    
    const currentPuzzles = tempReorderedPuzzles.length > 0 ? tempReorderedPuzzles : filteredPuzzles;
    const maxIndex = currentPuzzles.length - 1;
    
    if (e.key === 'ArrowLeft' && selectedPuzzleIndex > 0) {
      e.preventDefault();
      // Swap with previous puzzle
      const newPuzzles = [...currentPuzzles];
      [newPuzzles[selectedPuzzleIndex], newPuzzles[selectedPuzzleIndex - 1]] = 
        [newPuzzles[selectedPuzzleIndex - 1], newPuzzles[selectedPuzzleIndex]];
      setTempReorderedPuzzles(newPuzzles);
      setSelectedPuzzleIndex(selectedPuzzleIndex - 1);
      toast.info('Moved left');
    } else if (e.key === 'ArrowRight' && selectedPuzzleIndex < maxIndex) {
      e.preventDefault();
      // Swap with next puzzle
      const newPuzzles = [...currentPuzzles];
      [newPuzzles[selectedPuzzleIndex], newPuzzles[selectedPuzzleIndex + 1]] = 
        [newPuzzles[selectedPuzzleIndex + 1], newPuzzles[selectedPuzzleIndex]];
      setTempReorderedPuzzles(newPuzzles);
      setSelectedPuzzleIndex(selectedPuzzleIndex + 1);
      toast.info('Moved right');
    } else if (e.key === 'ArrowUp' && selectedPuzzleIndex > 0) {
      e.preventDefault();
      // Move up by 4 positions (simulating a row)
      const targetIndex = Math.max(0, selectedPuzzleIndex - 4);
      const newPuzzles = [...currentPuzzles];
      const [puzzle] = newPuzzles.splice(selectedPuzzleIndex, 1);
      newPuzzles.splice(targetIndex, 0, puzzle);
      setTempReorderedPuzzles(newPuzzles);
      setSelectedPuzzleIndex(targetIndex);
      toast.info('Moved up');
    } else if (e.key === 'ArrowDown' && selectedPuzzleIndex < maxIndex) {
      e.preventDefault();
      // Move down by 4 positions (simulating a row)
      const targetIndex = Math.min(maxIndex, selectedPuzzleIndex + 4);
      const newPuzzles = [...currentPuzzles];
      const [puzzle] = newPuzzles.splice(selectedPuzzleIndex, 1);
      newPuzzles.splice(targetIndex, 0, puzzle);
      setTempReorderedPuzzles(newPuzzles);
      setSelectedPuzzleIndex(targetIndex);
      toast.info('Moved down');
    }
  }, [isRearrangeMode, selectedPuzzleIndex, tempReorderedPuzzles, filteredPuzzles]);

  // Add/remove keyboard event listener
  React.useEffect(() => {
    if (isRearrangeMode) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isRearrangeMode, handleKeyDown]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Create Puzzles</h2>
          <p className="text-muted-foreground text-sm">Visually create chess puzzles by placing pieces and recording solutions</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={showAddCategoryDialog} onOpenChange={setShowAddCategoryDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Puzzle Category</DialogTitle>
                <DialogDescription>
                  Create a custom category for organizing your puzzles (e.g., "Mate in 1 - Advanced")
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="category-name">Category Name</Label>
                  <Input
                    id="category-name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g., Mate in 2 - Advanced"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category-desc">Description (optional)</Label>
                  <Input
                    id="category-desc"
                    value={newCategoryDescription}
                    onChange={(e) => setNewCategoryDescription(e.target.value)}
                    placeholder="Short description displayed on the category card"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category-icon">Icon</Label>
                  <Select value={newCategoryIcon} onValueChange={(val) => setNewCategoryIcon(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Offer piece icons and a target icon */}
                      {PIECE_ICONS.map(p => (
                        <SelectItem key={p.icon} value={p.icon}>{p.icon} {p.name}</SelectItem>
                      ))}
                      <SelectItem value={'🎯'}>🎯 Custom</SelectItem>
                      <SelectItem value={'📌'}>📌 Pin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {customCategories.length > 0 && (
                  <div className="space-y-2">
                    <Label>Custom Categories</Label>
                    <div className="flex flex-wrap gap-2">
                      {customCategories.map(cat => (
                        <div key={cat.id} className="inline-flex items-center gap-2 px-3 py-1 bg-secondary rounded-lg text-sm">
                          <span className="text-lg">{cat.icon || '🎯'}</span>
                          <div className="flex items-center gap-2">
                            <span>{cat.name}</span>
                            {cat.description && <span className="text-xs text-muted-foreground">— {cat.description}</span>}
                          </div>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="ml-2 text-destructive hover:text-destructive/80"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddCategoryDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddCategory}>
                  Add Category
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {showPuzzleList && !isRearrangeMode && (
            <Button
              variant="secondary"
              onClick={() => setIsRearrangeMode(true)}
            >
              <GripVertical className="w-4 h-4 mr-2" />
              Rearrange Puzzles
            </Button>
          )}
          {!isRearrangeMode && (
            <Button
              variant="outline"
              onClick={() => setShowPuzzleList(!showPuzzleList)}
            >
              {showPuzzleList ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showPuzzleList ? 'Create New' : `View Puzzles (${puzzles.length})`}
            </Button>
          )}
        </div>
      </div>

      {showPuzzleList ? (
        // Puzzle List View or Rearrange Mode
        <div className="space-y-4">
          {isRearrangeMode ? (
            // Rearrange Mode - Draggable Bubbles
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">Rearrange Puzzles</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Drag puzzles or tap to select and use arrow keys.
                    <span className="ml-2 inline-block px-2 py-0.5 bg-white border-2 border-gray-800 text-gray-800 text-xs rounded-full">White to play</span>
                    <span className="ml-2 inline-block px-2 py-0.5 bg-gray-800 text-white text-xs rounded-full">Black to play</span>
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsRearrangeMode(false);
                      setTempReorderedPuzzles([]);
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                      setSelectedPuzzleIndex(null);
                      loadPuzzles(); // Reset to saved order
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={saveRearrangedOrder}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Order
                  </Button>
                </div>
              </div>

              {/* Filter section for rearrange mode */}
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-4">
                    {/* Category Filter Buttons */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Filter by Category</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={categoryFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCategoryFilter('all')}
                        >
                          All ({puzzles.length})
                        </Button>
                        {allCategories.map(cat => {
                          const count = puzzles.filter(p => p.category === cat.id).length;
                          return (
                            <Button
                              key={cat.id}
                              variant={categoryFilter === cat.id ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setCategoryFilter(cat.id)}
                            >
                              {cat.name} ({count})
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Draggable puzzle bubbles */}
              <div className="flex flex-wrap gap-3 p-4 bg-muted/30 rounded-lg min-h-[200px]">
                {(tempReorderedPuzzles.length > 0 ? tempReorderedPuzzles : filteredPuzzles).length === 0 ? (
                  <div className="w-full text-center py-8 text-muted-foreground">
                    No puzzles in this category
                  </div>
                ) : (
                  (tempReorderedPuzzles.length > 0 ? tempReorderedPuzzles : filteredPuzzles).map((puzzle, index) => {
                    const activeColor = getActiveColorFromFEN(puzzle.fen);
                    const isWhiteToPlay = activeColor === 'white';
                    const isDragging = draggedIndex === index;
                    
                    return (
                      <div
                        key={puzzle._id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedPuzzleIndex(index)}
                        className={`
                          px-4 py-2.5 rounded-full cursor-move
                          flex items-center gap-2
                          transition-all duration-300 ease-in-out
                          hover:scale-105 hover:shadow-lg
                          ${isDragging ? 'opacity-40 scale-90 shadow-2xl' : 'opacity-100'}
                          ${selectedPuzzleIndex === index ? 'ring-4 ring-blue-500 ring-offset-2 scale-105' : ''}
                          ${isWhiteToPlay 
                            ? 'bg-white border-2 border-gray-800 text-gray-800' 
                            : 'bg-gray-800 text-white border-2 border-gray-800'
                          }
                        `}
                        style={{
                          transform: isDragging ? 'rotate(2deg)' : 'rotate(0deg)'
                        }}
                        title={`${puzzle.name} - ${isWhiteToPlay ? 'White' : 'Black'} to play - Click to select, use arrow keys to move`}
                      >
                        <GripVertical className="w-4 h-4 opacity-50" />
                        <span className="text-lg">{puzzle.icon}</span>
                        <span className="font-medium text-sm">{puzzle.name}</span>
                        <span className={`
                          text-xs px-2 py-0.5 rounded
                          ${isWhiteToPlay 
                            ? 'bg-gray-100 text-gray-700' 
                            : 'bg-gray-700 text-gray-100'
                          }
                        `}>
                          {allCategories.find(c => c.id === puzzle.category)?.name || puzzle.category}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            // Normal List View
            <>
          {/* Search and Filter Section */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Search Input */}
                <div>
                  <Label htmlFor="search" className="text-sm font-medium mb-2 block">Search Puzzles</Label>
                  <Input
                    id="search"
                    type="text"
                    placeholder="Search by puzzle title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full"
                  />
                </div>
                
                {/* Category Filter Buttons */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Filter by Category</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={categoryFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCategoryFilter('all')}
                    >
                      All ({puzzles.length})
                    </Button>
                    {allCategories.map(cat => {
                      const count = puzzles.filter(p => p.category === cat.id).length;
                      return (
                        <Button
                          key={cat.id}
                          variant={categoryFilter === cat.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCategoryFilter(cat.id)}
                        >
                          {cat.name} ({count})
                        </Button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Results count */}
                {(searchQuery || categoryFilter !== 'all') && (
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredPuzzles.length} of {puzzles.length} puzzles
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Puzzle List */}
          {filteredPuzzles.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {puzzles.length === 0 
                  ? 'No puzzles created yet. Create your first puzzle!'
                  : 'No puzzles match your search criteria.'}
              </CardContent>
            </Card>
          ) : (
            filteredPuzzles.map(puzzle => (
              <Card key={puzzle._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{puzzle.icon}</span>
                      <div>
                        <h3 className="font-semibold text-foreground">{puzzle.name}</h3>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">
                            {PUZZLE_CATEGORIES.find(c => c.id === puzzle.category)?.name || 
                             customCategories.find(c => c.id === puzzle.category)?.name || 
                             puzzle.category}
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
                        {puzzle.preloadedMove && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-blue-600">Preloaded Move:</span> {puzzle.preloadedMove}
                          </p>
                        )}
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
            </>
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
                initialPreloadedMove={newPuzzle.preloadedMove}
                initialMode={newPuzzle.solution && newPuzzle.solution.length > 0 ? 'solution' : 'setup'}
                onPositionSave={(fen, solution, preloadedMove) => {
                  setNewPuzzle({ ...newPuzzle, fen, solution, preloadedMove: preloadedMove || '' });
                }}
              />
              {newPuzzle.fen && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <strong className="text-green-700">✓ Position & Solution saved!</strong><br/>
                  {newPuzzle.preloadedMove && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-blue-600">Preloaded move: <span className="font-medium">{newPuzzle.preloadedMove}</span></span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNewPuzzle({ ...newPuzzle, preloadedMove: '' });
                          toast.success('Preloaded move cleared');
                        }}
                        className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                    </div>
                  )}
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
                      {allCategories.map(cat => (
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

                {/* Success Message */}
                <div className="space-y-2">
                  <Label htmlFor="successMessage">Success Message</Label>
                  <Input
                    id="successMessage"
                    value={newPuzzle.successMessage || 'Checkmate! Brilliant move!'}
                    onChange={(e) => setNewPuzzle({ ...newPuzzle, successMessage: e.target.value })}
                    placeholder="Checkmate! Brilliant move!"
                  />
                  <p className="text-xs text-muted-foreground">Message shown when puzzle is solved</p>
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
