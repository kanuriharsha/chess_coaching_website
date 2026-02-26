import { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth, User, Achievement, StudentProfile } from '@/contexts/AuthContext';
import VisualBoardEditor from '@/components/VisualBoardEditor';
import LiveChessGame from '@/components/LiveChessGame';
import { useLiveGame, GameRequest, LiveGame } from '@/hooks/useLiveGame';
import { 
  Users, 
  Trophy, 
  UserCheck, 
  UserX, 
  Puzzle, 
  BookOpen,
  Plus,
  Trash2,
  Edit,
  X,
  Save,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Lock,
  Unlock,
  Settings,
  Eye,
  EyeOff,
  Calendar,
  CalendarDays,
  Check,
  XCircle,
  Activity,
  Clock,
  TrendingUp,
  Target,
  ArrowLeft,
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  GraduationCap,
  RotateCcw,
  RefreshCw,
  Gamepad2,
  Play,
  Timer,
  Wifi,
  Crown
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Stats {
  totalStudents: number;
  activeStudents: number;
  totalPuzzles: number;
  totalOpenings: number;
  totalFamousMates: number;
  totalBestGames: number;
}

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
  successMessage?: string;
}

interface OpeningData {
  _id?: string;
  name: string;
  description: string;
  category: string;
  moves: { san: string; comment?: string; evaluation?: string }[];
  isEnabled: boolean;
}

interface FamousMateData {
  _id?: string;
  name: string;
  description: string;
  category: string;
  moves: { san: string; comment?: string; evaluation?: string }[];
  isEnabled: boolean;
}

interface BestGameData {
  _id?: string;
  title: string;
  players: string;
  description: string;
  category: 'brilliant' | 'best' | 'blunder';
  moves: string[];
  highlights: number[];
  isEnabled: boolean;
}

interface ContentAccess {
  userId: string;
  puzzleAccess: {
    [key: string]: { enabled: boolean; limit: number; rangeStart?: number; rangeEnd?: number };
  };
  openingAccess: {
    enabled: boolean;
    allowedOpenings: string[];
  };
  famousMatesAccess: {
    enabled: boolean;
    allowedMates: string[];
  };
  bestGamesAccess: {
    enabled: boolean;
    allowedGames: string[];
  };
}

interface AttendanceRecord {
  date: string;
  status: 'present' | 'absent';
  note?: string;
}

interface PuzzleProgress {
  category: string;
  totalPuzzles: number;
  solvedPuzzles: number;
  puzzleDetails: {
    puzzleId: string;
    puzzleName: string;
    solved: boolean;
    solvedAt?: string;
    attempts: number;
  }[];
}

interface UserActivity {
  type: 'page_visit' | 'puzzle_attempt' | 'puzzle_solved' | 'puzzle_failed' | 'opening_viewed' | 'game_viewed' | 'login' | 'logout';
  description: string;
  timestamp: string;
  duration?: number;
  details?: {
    page?: string;
    puzzleId?: string;
    puzzleName?: string;
    puzzleNumber?: number;
    category?: string;
    attempts?: number;
    result?: 'passed' | 'failed';
    timeSpent?: number;
  };
}

const PUZZLE_CATEGORIES = [
  { id: 'mate-in-1', name: 'Mate in 1', icon: '♔' },
  { id: 'mate-in-2', name: 'Mate in 2', icon: '♕' },
  { id: 'mate-in-3', name: 'Mate in 3', icon: '♖' },
  { id: 'famous-mates', name: 'Famous Mates', icon: '♔' },
  { id: 'pins', name: 'Pins', icon: '♗' },
  { id: 'forks', name: 'Forks', icon: '♘' },
  { id: 'traps', name: 'Traps', icon: '♙' },
];

const AdminDashboard = () => {
  const { user, token, getAllUsers, updateUser, deleteUser, register } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalStudents: 0, activeStudents: 0, totalPuzzles: 0, totalOpenings: 0, totalFamousMates: 0, totalBestGames: 0 });
  const [users, setUsers] = useState<User[]>([]);
  const [puzzles, setPuzzles] = useState<PuzzleData[]>([]);
  const [openings, setOpenings] = useState<OpeningData[]>([]);
  const [famousMates, setFamousMates] = useState<FamousMateData[]>([]);
  const [bestGames, setBestGames] = useState<BestGameData[]>([]);
  const [activeTab, setActiveTab] = useState('users');
  const [isLoading, setIsLoading] = useState(true);
  
  // Custom puzzle categories from localStorage
  const [customCategories, setCustomCategories] = useState<Array<{id: string, name: string, description?: string, icon?: string}>>([]);

  // Live Game States
  const {
    isConnected: isSocketConnected,
    gameRequests,
    currentGame,
    acceptGameRequest,
    declineGameRequest,
    leaveGame
  } = useLiveGame();
  const [selectedTimeControl, setSelectedTimeControl] = useState<number>(600); // 10 minutes default
  const [showAcceptGameDialog, setShowAcceptGameDialog] = useState(false);
  const [selectedGameRequest, setSelectedGameRequest] = useState<GameRequest | null>(null);

  // User Detail View State
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<User | null>(null);
  const [userAttendance, setUserAttendance] = useState<AttendanceRecord[]>([]);
  const [userPuzzleProgress, setUserPuzzleProgress] = useState<PuzzleProgress[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [userFees, setUserFees] = useState<any[]>([]);
  const [isLoadingFees, setIsLoadingFees] = useState(false);
  
  // Store all users' fees for quick lookup
  const [allUsersFees, setAllUsersFees] = useState<{ [userId: string]: any[] }>({});
  
  // Fee secret note editing state
  const [editingSecretNote, setEditingSecretNote] = useState<{ [feeId: string]: string }>({});
  
  // Common fee note (shared for all fees of this user)
  const [commonFeeNote, setCommonFeeNote] = useState<string>('');
  const [showCommonFeeNote, setShowCommonFeeNote] = useState(false);
  const [isEditingCommonFeeNote, setIsEditingCommonFeeNote] = useState(false);
  const [tempCommonFeeNote, setTempCommonFeeNote] = useState<string>('');
  
  // Puzzle category expansion state
  const [expandedPuzzleCategories, setExpandedPuzzleCategories] = useState<Set<string>>(new Set());
  
  const [activityFilter, setActivityFilter] = useState<'all' | 'solved' | 'failed'>('all');
  const [activityCategory, setActivityCategory] = useState<'all' | 'puzzles' | 'games' | 'openings' | 'bestgames'>('all');
  const [isEditingUserProfile, setIsEditingUserProfile] = useState(false);

  // Filtered activities and totals for admin live feed
  const filteredActivities = useMemo(() => {
    // first filter by solved/failed/all
    const byResult = userActivity.filter(a => {
      if (activityFilter === 'all') return true;
      if (activityFilter === 'solved') return a.type === 'puzzle_solved';
      return a.type === 'puzzle_failed';
    });

    // then by category
    return byResult.filter(a => {
      if (activityCategory === 'all') return true;
      if (activityCategory === 'puzzles') return a.type?.startsWith?.('puzzle');
      if (activityCategory === 'games') return a.type === 'game_viewed';
      if (activityCategory === 'openings') return a.type === 'opening_viewed';
      if (activityCategory === 'bestgames') return a.details?.category === 'bestgames';
      return true;
    });
  }, [userActivity, activityFilter, activityCategory]);

  const activityRowsCount = filteredActivities.length;
  const activityTotalSeconds = useMemo(() => {
    return filteredActivities.reduce((acc, a) => acc + (a.details?.timeSpent || 0), 0);
  }, [filteredActivities]);

  const formatSecondsToHM = (secs: number) => {
    if (!secs || secs <= 0) return '0m';
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Calculate accuracy per category from activity data
  const categoryAccuracy = useMemo(() => {
    const accuracyByCategory: { [key: string]: { correct: number; total: number; accuracy: number } } = {};
    
    // Filter puzzle activities
    const puzzleActivities = userActivity.filter(a => 
      a.type === 'puzzle_solved' || a.type === 'puzzle_failed'
    );
    
    // Group by category
    puzzleActivities.forEach(activity => {
      const category = activity.details?.category || 'unknown';
      if (!accuracyByCategory[category]) {
        accuracyByCategory[category] = { correct: 0, total: 0, accuracy: 0 };
      }
      
      accuracyByCategory[category].total++;
      if (activity.type === 'puzzle_solved') {
        accuracyByCategory[category].correct++;
      }
    });
    
    // Calculate accuracy percentage
    Object.keys(accuracyByCategory).forEach(category => {
      const data = accuracyByCategory[category];
      data.accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    });
    
    return accuracyByCategory;
  }, [userActivity]);

  const [editUserProfile, setEditUserProfile] = useState<Partial<StudentProfile>>({});
  const [editUserUsername, setEditUserUsername] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPassword, setEditUserPassword] = useState('');

  // Content Access states
  const [selectedUserForAccess, setSelectedUserForAccess] = useState<User | null>(null);
  const [userContentAccess, setUserContentAccess] = useState<ContentAccess | null>(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [puzzleCounts, setPuzzleCounts] = useState<{ [key: string]: number }>({});
  // Bulk selective access UI state
  const [bulkSelectionType, setBulkSelectionType] = useState<'openings' | 'famousMates' | 'bestGames'>('openings');
  const [selectedContentItemId, setSelectedContentItemId] = useState<string | null>(null);
  const [selectedStudentsForBulk, setSelectedStudentsForBulk] = useState<{ [userId: string]: boolean }>({});

  // Attendance states
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedUserForAttendance, setSelectedUserForAttendance] = useState<User | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'absent'>('present');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [showBulkAttendance, setShowBulkAttendance] = useState(false);
  const [bulkAttendanceDate, setBulkAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkAttendance, setBulkAttendance] = useState<{ [userId: string]: { status: 'present' | 'absent'; note: string } }>({});

  // Edit user states
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserJoiningDate, setEditUserJoiningDate] = useState('');
  const [editUserAchievements, setEditUserAchievements] = useState<Achievement[]>([]);
  const [newAchievement, setNewAchievement] = useState({ title: '', description: '', icon: '🏆' });

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddPuzzle, setShowAddPuzzle] = useState(false);
  const [showAddOpening, setShowAddOpening] = useState(false);
  const [showAddBestGame, setShowAddBestGame] = useState(false);

  // Form states
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'student' as 'admin' | 'student' });
  const [newPuzzle, setNewPuzzle] = useState<PuzzleData>({
    name: '', category: 'mate-in-1', description: '', fen: '', solution: [], hint: '', difficulty: 'medium', icon: '♔', isEnabled: true, successMessage: 'Checkmate! Brilliant move!'
  });
  const [newOpening, setNewOpening] = useState<OpeningData>({
    name: '', description: '', category: 'Open Games', moves: [], isEnabled: true
  });
  const [newBestGame, setNewBestGame] = useState<BestGameData>({
    title: '', players: '', description: '', category: 'best', moves: [], highlights: [], isEnabled: true
  });

  // Load custom categories from API (server-side – consistent across all browsers)
  useEffect(() => {
    loadCustomCategoriesFromAPI();
  }, []);

  const loadCustomCategoriesFromAPI = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzle-categories`);
      if (response.ok) {
        const data = await response.json();
        setCustomCategories(data.map((c: any) => ({ id: c.categoryId, name: c.name, description: c.description, icon: c.icon })));
      }
    } catch (error) {
      console.error('Failed to load custom categories:', error);
    }
  };

  // Combine default and custom categories
  const allPuzzleCategories = useMemo(() => {
    const customCats = customCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon || '🎯'
    }));
    return [...PUZZLE_CATEGORIES, ...customCats];
  }, [customCategories]);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAllData();
    }
  }, [user]);

  const loadAllData = async () => {
    setIsLoading(true);
    await Promise.all([
      loadStats(),
      loadUsers(),
      loadPuzzles(),
      loadOpenings(),
      loadFamousMates(),
      loadBestGames(),
      loadCustomCategoriesFromAPI()
    ]);
    setIsLoading(false);
  };

  const loadStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Load stats error:', error);
    }
  };

  const loadUsers = async (): Promise<User[]> => {
    const data = await getAllUsers();
    setUsers(data);
    // Load fees for all students
    await loadAllUsersFees(data);
    return data;
  };

  // Load fees for all students
  const loadAllUsersFees = async (userList: User[]) => {
    const feesMap: { [userId: string]: any[] } = {};
    const studentUsers = userList.filter(u => u.role === 'student');
    
    await Promise.all(
      studentUsers.map(async (u) => {
        try {
          const response = await fetch(`${API_BASE_URL}/users/${u.id}/fees`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            feesMap[u.id] = data || [];
          }
        } catch (error) {
          console.error(`Error loading fees for user ${u.id}:`, error);
          feesMap[u.id] = [];
        }
      })
    );
    
    setAllUsersFees(feesMap);
  };

  // Check if user has any unpaid fees
  const hasUnpaidFees = (userId: string): boolean => {
    const fees = allUsersFees[userId];
    if (!fees || fees.length === 0) return false;
    return fees.some(fee => !fee.paid);
  };

  // Check if user has incomplete puzzles in the assigned range for a category
  // Check if user has incomplete puzzles in the assigned range for a category
  const hasIncompletePuzzlesInRange = (categoryId: string): boolean => {
    if (!userContentAccess?.puzzleAccess?.[categoryId]?.enabled) return false;
    
    const access = userContentAccess.puzzleAccess[categoryId];
    const rangeStart = access.rangeStart;
    const rangeEnd = access.rangeEnd;
    
    // If no range is set, return false (not incomplete)
    if (!rangeStart || !rangeEnd) return false;
    
    // Find the category progress
    const categoryProgress = userPuzzleProgress.find(p => p.category === categoryId);
    if (!categoryProgress || !categoryProgress.puzzleDetails) return false;
    
    // Check if all puzzles in the range are solved
    // puzzleDetails is 0-indexed, so puzzle #1 is at index 0
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const puzzleIndex = i - 1; // Convert puzzle number to array index
      const puzzle = categoryProgress.puzzleDetails[puzzleIndex];
      if (!puzzle || !puzzle.solved) {
        return true; // Found an incomplete puzzle
      }
    }
    
    return false; // All puzzles in range are completed
  };

  // Get list of incomplete puzzles in the assigned range for a category
  const getIncompletePuzzles = (categoryId: string): { number: number; name: string }[] => {
    if (!userContentAccess?.puzzleAccess?.[categoryId]?.enabled) return [];
    
    const access = userContentAccess.puzzleAccess[categoryId];
    const rangeStart = access.rangeStart;
    const rangeEnd = access.rangeEnd;
    
    if (!rangeStart || !rangeEnd) return [];
    
    const categoryProgress = userPuzzleProgress.find(p => p.category === categoryId);
    if (!categoryProgress || !categoryProgress.puzzleDetails) {
      return [];
    }
    
    const incomplete: { number: number; name: string }[] = [];
    
    // puzzleDetails is 0-indexed, so puzzle #1 is at index 0
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const puzzleIndex = i - 1; // Convert puzzle number to array index
      const puzzle = categoryProgress.puzzleDetails[puzzleIndex];
      if (!puzzle || !puzzle.solved) {
        incomplete.push({
          number: i,
          name: puzzle?.puzzleName || `Puzzle ${i}`
        });
      }
    }
    
    return incomplete;
  };

  const loadPuzzles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPuzzles(data);
      }
    } catch (error) {
      console.error('Load puzzles error:', error);
    }
  };

  const loadOpenings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/openings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setOpenings(data);
      }
    } catch (error) {
      console.error('Load openings error:', error);
    }
  };

  const loadFamousMates = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/famous-mates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFamousMates(data);
      }
    } catch (error) {
      console.error('Load famous mates error:', error);
    }
  };

  const loadBestGames = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/bestgames`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBestGames(data);
      }
    } catch (error) {
      console.error('Load best games error:', error);
    }
  };

  // Calculate puzzle counts by category
  useEffect(() => {
    const counts: { [key: string]: number } = {};
    puzzles.forEach(p => {
      if (p.isEnabled) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    });
    setPuzzleCounts(counts);
  }, [puzzles]);

  // When an item is selected for selective bulk changes, prefill which students already have it
  useEffect(() => {
    const loadPrefill = async () => {
      if (!selectedContentItemId) {
        setSelectedStudentsForBulk({});
        return;
      }

      const studentList = users.filter(u => u.role === 'student');
      const map: { [id: string]: boolean } = {};

      await Promise.all(studentList.map(async (stu) => {
        try {
          const resp = await fetch(`${API_BASE_URL}/content-access/${stu.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
          if (!resp.ok) return;
          const access: ContentAccess = await resp.json();

          if (bulkSelectionType === 'openings') {
            const list = access.openingAccess?.allowedOpenings || [];
            if (list.length === 0 && access.openingAccess?.enabled) {
              // all unlocked -> mark true
              map[stu.id] = true;
            } else {
              map[stu.id] = list.includes(selectedContentItemId!);
            }
          }

          if (bulkSelectionType === 'famousMates') {
            const list = access.famousMatesAccess?.allowedMates || [];
            if (list.length === 0 && access.famousMatesAccess?.enabled) {
              map[stu.id] = true;
            } else {
              map[stu.id] = list.includes(selectedContentItemId!);
            }
          }

          if (bulkSelectionType === 'bestGames') {
            const list = access.bestGamesAccess?.allowedGames || [];
            if (list.length === 0 && access.bestGamesAccess?.enabled) {
              map[stu.id] = true;
            } else {
              map[stu.id] = list.includes(selectedContentItemId!);
            }
          }
        } catch (err) {
          // ignore
        }
      }));

      setSelectedStudentsForBulk(map);
    };

    loadPrefill();
  }, [selectedContentItemId, bulkSelectionType, users]);

  // Content Access functions
  const loadUserContentAccess = async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/content-access/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserContentAccess(data);
      }
    } catch (error) {
      console.error('Load content access error:', error);
    }
  };

  const handleOpenAccessModal = async (u: User) => {
    setSelectedUserForAccess(u);
    await Promise.all([
      loadUserContentAccess(u.id),
      loadUserPuzzleProgress(u.id)
    ]);
    setShowAccessModal(true);
  };

  const handleUpdateContentAccess = async () => {
    if (!selectedUserForAccess || !userContentAccess) return;

    try {
      const response = await fetch(`${API_BASE_URL}/content-access/${selectedUserForAccess.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          puzzleAccess: userContentAccess.puzzleAccess,
          openingAccess: userContentAccess.openingAccess,
          famousMatesAccess: userContentAccess.famousMatesAccess,
          bestGamesAccess: userContentAccess.bestGamesAccess
        })
      });

      if (response.ok) {
        toast.success(`Content access updated for ${selectedUserForAccess.username}`);
        setShowAccessModal(false);
      } else {
        toast.error('Failed to update content access');
      }
    } catch (error) {
      toast.error('Failed to update content access');
    }
  };

  const handleBulkUpdateAccess = async (
    puzzleAccess: ContentAccess['puzzleAccess'],
    openingAccess: ContentAccess['openingAccess'],
    famousMatesAccess: ContentAccess['famousMatesAccess'],
    bestGamesAccess: ContentAccess['bestGamesAccess'],
    userIds?: string[]
  ) => {
    try {
      const body: any = { puzzleAccess, openingAccess, famousMatesAccess, bestGamesAccess };
      if (userIds && userIds.length > 0) body.userIds = userIds;

      const response = await fetch(`${API_BASE_URL}/content-access-bulk`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        toast.success(userIds && userIds.length > 0 ? `Content access updated for ${userIds.length} users` : 'Content access updated for all students');
      } else {
        toast.error('Failed to update content access');
      }
    } catch (error) {
      toast.error('Failed to update content access');
    }
  };

  const updatePuzzleAccess = (category: string, field: 'enabled' | 'limit' | 'rangeStart' | 'rangeEnd', value: boolean | number | null) => {
    if (!userContentAccess) return;
    
    setUserContentAccess({
      ...userContentAccess,
      puzzleAccess: {
        ...userContentAccess.puzzleAccess,
        [category]: {
          ...userContentAccess.puzzleAccess[category],
          [field]: value
        }
      }
    });
  };

  // User handlers
  const handleToggleUserAccess = async (userId: string, currentStatus: boolean) => {
    const success = await updateUser(userId, { isEnabled: !currentStatus });
    if (success) {
      toast.success(`User ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
      loadUsers();
      loadStats();
    } else {
      toast.error('Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      const success = await deleteUser(userId);
      if (success) {
        toast.success('User deleted successfully');
        loadUsers();
        loadStats();
      } else {
        toast.error('Failed to delete user');
      }
    }
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) {
      toast.error('Please fill in all fields');
      return;
    }
    const success = await register(newUser.username, newUser.password, newUser.role);
    if (success) {
      toast.success('User added successfully');
      setShowAddUser(false);
      setNewUser({ username: '', password: '', role: 'student' });
      loadUsers();
      loadStats();
    } else {
      toast.error('Failed to add user');
    }
  };

  // Edit user with joining date and achievements
  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setEditUserJoiningDate(u.joiningDate ? new Date(u.joiningDate).toISOString().split('T')[0] : '');
    setEditUserAchievements(u.achievements || []);
    setNewAchievement({ title: '', description: '', icon: '🏆' });
    setShowEditUserModal(true);
  };

  // User Detail View Functions
  const handleViewUserDetail = async (u: User) => {
    setSelectedUserForDetail(u);
    setEditUserProfile(u.profile || {});
    setEditUserUsername(u.username || '');
    setEditUserEmail((u as any).email || '');
    setEditUserPassword('');
    setIsEditingUserProfile(false);
    
    // Load user-specific data
    await Promise.all([
      loadUserAttendance(u.id),
      loadUserPuzzleProgress(u.id),
      loadUserActivity(u.id),
      loadUserFees(u.id)
    ]);
  };

  // Auto-refresh activity when viewing user detail
  useEffect(() => {
    if (selectedUserForDetail) {
      const interval = setInterval(() => {
        loadUserActivity(selectedUserForDetail.id);
      }, 10000); // Refresh every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [selectedUserForDetail]);

  useEffect(() => {
    if (selectedUserForDetail) {
      loadUserFees(selectedUserForDetail.id);
      // Load common fee note from user data (stored in database)
      setCommonFeeNote(selectedUserForDetail.commonNote || '');
      setShowCommonFeeNote(false);
      setIsEditingCommonFeeNote(false);
    } else {
      setUserFees([]);
      setCommonFeeNote('');
      setShowCommonFeeNote(false);
      setIsEditingCommonFeeNote(false);
    }
  }, [selectedUserForDetail]);

  const loadUserAttendance = async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/attendance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserAttendance(data);
      }
    } catch (error) {
      console.error('Load user attendance error:', error);
    }
  };

  const loadUserPuzzleProgress = async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/puzzle-progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserPuzzleProgress(data);
      }
    } catch (error) {
      console.error('Load user puzzle progress error:', error);
    }
  };

  const loadUserActivity = async (userId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/activity`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserActivity(data);
      }
    } catch (error) {
      console.error('Load user activity error:', error);
    }
  };

  const loadUserFees = async (userId: string) => {
    try {
      setIsLoadingFees(true);
      const response = await fetch(`${API_BASE_URL}/users/${userId}/fees`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserFees(data || []);
      }
    } catch (error) {
      console.error('Load user fees error:', error);
    } finally {
      setIsLoadingFees(false);
    }
  };

  const handleSaveUserDetailProfile = async () => {
    if (!selectedUserForDetail) return;
    
    try {
      const updateData: any = {
        username: editUserUsername,
        email: editUserEmail,
        profile: editUserProfile
      };
      
      // Only include password if it's been set
      if (editUserPassword && editUserPassword.trim().length > 0) {
        updateData.password = editUserPassword;
      }
      const success = await updateUser(selectedUserForDetail.id, updateData as any);

      if (success) {
        toast.success('Profile updated successfully');
        const freshUsers = await loadUsers(); // refresh user list
        // Update selected user with fresh copy from the returned data (not stale state)
        const refreshed = freshUsers.find(u => u.id === selectedUserForDetail.id);
        if (refreshed) setSelectedUserForDetail(refreshed as any);
        setIsEditingUserProfile(false);
      } else {
        toast.error('Failed to update profile');
      }
    } catch (error) {
      toast.error('Failed to update profile');
    }
  };

  // Fee secret note functions
  const toggleFeeSecretVisibility = async (feeId: string, currentVisible: boolean) => {
    if (!selectedUserForDetail) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/users/${selectedUserForDetail.id}/fees/${feeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ secretVisible: !currentVisible })
      });

      if (response.ok) {
        const updatedFee = await response.json();
        const updatedFees = userFees.map(f => f._id === feeId ? updatedFee.fee || updatedFee : f);
        setUserFees(updatedFees);
        
        if (selectedUserForDetail?.id) {
          setAllUsersFees(prev => ({
            ...prev,
            [selectedUserForDetail.id]: updatedFees
          }));
        }
      } else {
        toast.error('Failed to update secret visibility');
      }
    } catch (error) {
      console.error('Toggle secret visibility error:', error);
      toast.error('Failed to update secret visibility');
    }
  };

  const updateFeeSecretNote = async (feeId: string, secretNote: string) => {
    if (!selectedUserForDetail) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/users/${selectedUserForDetail.id}/fees/${feeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ secretNote })
      });

      if (response.ok) {
        const updatedFee = await response.json();
        const updatedFees = userFees.map(f => f._id === feeId ? { ...f, ...updatedFee.fee } : f);
        setUserFees(updatedFees);
        
        if (selectedUserForDetail?.id) {
          setAllUsersFees(prev => ({
            ...prev,
            [selectedUserForDetail.id]: updatedFees
          }));
        }
        
        // Remove from editing state
        setEditingSecretNote(prev => {
          const newState = { ...prev };
          delete newState[feeId];
          return newState;
        });
        
        toast.success('Secret note updated');
      } else {
        toast.error('Failed to update secret note');
      }
    } catch (error) {
      console.error('Update secret note error:', error);
      toast.error('Failed to update secret note');
    }
  };

  const toggleSecretNoteVisibility = async (feeId: string, secretVisible: boolean) => {
    if (!selectedUserForDetail) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/users/${selectedUserForDetail.id}/fees/${feeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ secretVisible })
      });

      if (response.ok) {
        const updatedFee = await response.json();
        const updatedFees = userFees.map(f => f._id === feeId ? { ...f, ...updatedFee.fee } : f);
        setUserFees(updatedFees);
        
        if (selectedUserForDetail?.id) {
          setAllUsersFees(prev => ({
            ...prev,
            [selectedUserForDetail.id]: updatedFees
          }));
        }
      }
    } catch (error) {
      console.error('Error toggling secret note visibility:', error);
    }
  };

  // Common fee note handlers
  const handleSaveCommonFeeNote = async () => {
    if (!selectedUserForDetail) return;
    try {
      const response = await fetch(`${API_BASE_URL}/users/${selectedUserForDetail.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ commonNote: tempCommonFeeNote })
      });
      if (response.ok) {
        const data = await response.json();
        const savedNote = data?.user?.commonNote ?? tempCommonFeeNote;
        // Update local display state
        setCommonFeeNote(savedNote);
        // Update selected user in-memory so the note stays visible immediately
        setSelectedUserForDetail(prev => prev ? { ...prev, commonNote: savedNote } : prev);
        // Keep users list in sync so re-opening the profile shows the correct note
        setUsers(prev => prev.map(u => u.id === selectedUserForDetail.id ? { ...u, commonNote: savedNote } : u));
        setIsEditingCommonFeeNote(false);
        toast.success('Common note saved');
      } else {
        const errText = await response.text().catch(() => '');
        console.error('Save common note failed:', response.status, errText);
        toast.error('Failed to save common note');
      }
    } catch (error) {
      console.error('Save common note error:', error);
      toast.error('Failed to save common note');
    }
  };

  const handleCancelCommonFeeNote = () => {
    setTempCommonFeeNote(commonFeeNote);
    setIsEditingCommonFeeNote(false);
  };

  const handleToggleCommonFeeNote = () => {
    if (!showCommonFeeNote) {
      setTempCommonFeeNote(commonFeeNote);
    }
    setShowCommonFeeNote(!showCommonFeeNote);
    setIsEditingCommonFeeNote(false);
  };

  // Toggle puzzle category expansion
  const togglePuzzleCategory = (category: string) => {
    setExpandedPuzzleCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'puzzle_solved':
        return '✅';
      case 'puzzle_failed':
        return '❌';
      case 'puzzle_attempt':
        return '🎯';
      case 'page_visit':
        return '📄';
      case 'opening_viewed':
        return '📖';
      case 'game_viewed':
        return '🏆';
      case 'login':
        return '🔓';
      case 'logout':
        return '🔒';
      default:
        return '📌';
    }
  };

  const handleSaveUserProfile = async () => {
    if (!editingUser) return;
    
    try {
      const success = await updateUser(editingUser.id, {
        joiningDate: editUserJoiningDate,
        achievements: editUserAchievements
      } as any);

      if (success) {
        toast.success('User profile updated successfully');
        setShowEditUserModal(false);
        await loadUsers();
      } else {
        toast.error('Failed to update user profile');
      }
    } catch (error) {
      toast.error('Failed to update user profile');
    }
  };

  const handleAddAchievement = () => {
    if (!newAchievement.title.trim()) {
      toast.error('Achievement title is required');
      return;
    }
    
    const achievement: Achievement = {
      ...newAchievement,
      date: new Date().toISOString()
    };
    
    setEditUserAchievements([...editUserAchievements, achievement]);
    setNewAchievement({ title: '', description: '', icon: '🏆' });
    toast.success('Achievement added');
  };

  const handleRemoveAchievement = (index: number) => {
    setEditUserAchievements(editUserAchievements.filter((_, i) => i !== index));
    toast.success('Achievement removed');
  };

  // Attendance handlers
  const handleOpenAttendanceModal = (u: User) => {
    setSelectedUserForAttendance(u);
    setAttendanceDate(new Date().toISOString().split('T')[0]);
    setAttendanceStatus('present');
    setAttendanceNote('');
    setShowAttendanceModal(true);
  };

  const handleMarkAttendance = async () => {
    if (!selectedUserForAttendance) return;

    try {
      const response = await fetch(`${API_BASE_URL}/users/${selectedUserForAttendance.id}/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: attendanceDate,
          status: attendanceStatus,
          note: attendanceNote
        })
      });

      if (response.ok) {
        toast.success(`Attendance marked for ${selectedUserForAttendance.username}`);
        setShowAttendanceModal(false);
        loadUsers();
      } else {
        toast.error('Failed to mark attendance');
      }
    } catch (error) {
      toast.error('Failed to mark attendance');
    }
  };

  const handleOpenBulkAttendance = () => {
    setBulkAttendanceDate(new Date().toISOString().split('T')[0]);
    const initialBulk: { [userId: string]: { status: 'present' | 'absent'; note: string } } = {};
    users.filter(u => u.role === 'student').forEach(u => {
      initialBulk[u.id] = { status: 'present', note: '' };
    });
    setBulkAttendance(initialBulk);
    setShowBulkAttendance(true);
  };

  const handleSaveBulkAttendance = async () => {
    try {
      const attendanceRecords = Object.entries(bulkAttendance).map(([userId, data]) => ({
        userId,
        status: data.status,
        note: data.note
      }));

      const response = await fetch(`${API_BASE_URL}/attendance/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: bulkAttendanceDate,
          attendanceRecords
        })
      });

      if (response.ok) {
        toast.success('Bulk attendance saved successfully');
        setShowBulkAttendance(false);
        loadUsers();
      } else {
        toast.error('Failed to save bulk attendance');
      }
    } catch (error) {
      toast.error('Failed to save bulk attendance');
    }
  };

  const getAttendanceForDate = (u: User, date: string): AttendanceRecord | undefined => {
    if (!u.attendance) return undefined;
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    return u.attendance.find(a => {
      const aDate = new Date(a.date);
      aDate.setHours(0, 0, 0, 0);
      return aDate.getTime() === targetDate.getTime();
    });
  };

  const getTodayAttendance = (u: User): AttendanceRecord | undefined => {
    return getAttendanceForDate(u, new Date().toISOString().split('T')[0]);
  };

  // Puzzle handlers
  const handleAddPuzzle = async () => {
    if (!newPuzzle.name || !newPuzzle.fen) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newPuzzle)
      });
      if (response.ok) {
        toast.success('Puzzle added successfully');
        setShowAddPuzzle(false);
        setNewPuzzle({ name: '', category: 'mate-in-1', description: '', fen: '', solution: [], hint: '', difficulty: 'medium', icon: '♔', isEnabled: true, successMessage: 'Checkmate! Brilliant move!' });
        loadPuzzles();
        loadStats();
      } else {
        toast.error('Failed to add puzzle');
      }
    } catch (error) {
      toast.error('Failed to add puzzle');
    }
  };

  const handleTogglePuzzle = async (puzzleId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/puzzles/${puzzleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isEnabled: !currentStatus })
      });
      if (response.ok) {
        toast.success(`Puzzle ${!currentStatus ? 'enabled' : 'disabled'}`);
        loadPuzzles();
      }
    } catch (error) {
      toast.error('Failed to update puzzle');
    }
  };

  const handleDeletePuzzle = async (puzzleId: string) => {
    if (confirm('Are you sure you want to delete this puzzle?')) {
      try {
        const response = await fetch(`${API_BASE_URL}/puzzles/${puzzleId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          toast.success('Puzzle deleted');
          loadPuzzles();
          loadStats();
        }
      } catch (error) {
        toast.error('Failed to delete puzzle');
      }
    }
  };

  // Opening handlers
  const handleAddOpening = async () => {
    if (!newOpening.name || !newOpening.category) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/openings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newOpening)
      });
      if (response.ok) {
        toast.success('Opening added successfully');
        setShowAddOpening(false);
        setNewOpening({ name: '', description: '', category: 'Open Games', moves: [], isEnabled: true });
        loadOpenings();
        loadStats();
      } else {
        toast.error('Failed to add opening');
      }
    } catch (error) {
      toast.error('Failed to add opening');
    }
  };

  const handleToggleOpening = async (openingId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/openings/${openingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isEnabled: !currentStatus })
      });
      if (response.ok) {
        toast.success(`Opening ${!currentStatus ? 'enabled' : 'disabled'}`);
        loadOpenings();
      }
    } catch (error) {
      toast.error('Failed to update opening');
    }
  };

  const handleDeleteOpening = async (openingId: string) => {
    if (confirm('Are you sure you want to delete this opening?')) {
      try {
        const response = await fetch(`${API_BASE_URL}/openings/${openingId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          toast.success('Opening deleted');
          loadOpenings();
          loadStats();
        }
      } catch (error) {
        toast.error('Failed to delete opening');
      }
    }
  };

  // Best Game handlers
  const handleAddBestGame = async () => {
    if (!newBestGame.title || !newBestGame.players) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/bestgames`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newBestGame)
      });
      if (response.ok) {
        toast.success('Best game added successfully');
        setShowAddBestGame(false);
        setNewBestGame({ title: '', players: '', description: '', category: 'best', moves: [], highlights: [], isEnabled: true });
        loadBestGames();
        loadStats();
      } else {
        toast.error('Failed to add best game');
      }
    } catch (error) {
      toast.error('Failed to add best game');
    }
  };

  const handleToggleBestGame = async (gameId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bestgames/${gameId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isEnabled: !currentStatus })
      });
      if (response.ok) {
        toast.success(`Best game ${!currentStatus ? 'enabled' : 'disabled'}`);
        loadBestGames();
      }
    } catch (error) {
      toast.error('Failed to update best game');
    }
  };

  const handleDeleteBestGame = async (gameId: string) => {
    if (confirm('Are you sure you want to delete this best game?')) {
      try {
        const response = await fetch(`${API_BASE_URL}/bestgames/${gameId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          toast.success('Best game deleted');
          loadBestGames();
          loadStats();
        }
      } catch (error) {
        toast.error('Failed to delete best game');
      }
    }
  };

  if (user?.role !== 'admin') {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-serif font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to view this page.</p>
        </div>
      </AppLayout>
    );
  }

  // User Detail View
  if (selectedUserForDetail) {
    const profile = selectedUserForDetail.profile;
    const presentCount = userAttendance.filter(a => a.status === 'present').length;
    const absentCount = userAttendance.filter(a => a.status === 'absent').length;
    const attendancePercentage = userAttendance.length > 0 
      ? Math.round((presentCount / userAttendance.length) * 100) 
      : 0;
    
    const totalPuzzlesCompleted = userPuzzleProgress.reduce((sum, cat) => sum + cat.solvedPuzzles, 0);
    const totalPuzzlesAvailable = userPuzzleProgress.reduce((sum, cat) => sum + cat.totalPuzzles, 0);
    const completionRate = totalPuzzlesAvailable > 0 
      ? Math.round((totalPuzzlesCompleted / totalPuzzlesAvailable) * 100) 
      : 0;

    return (
      <AppLayout>
        <div className="animate-fade-in">
          {/* Header with Back Button */}
          <div className="mb-8">
            <Button 
              variant="ghost" 
              onClick={() => setSelectedUserForDetail(null)}
              className="mb-4 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Users
            </Button>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-1">
                  {selectedUserForDetail.username}'s Profile
                </h1>
                <p className="text-sm text-muted-foreground">
                  Complete profile, activity, and performance analytics
                </p>
              </div>
              {!isEditingUserProfile ? (
                <Button onClick={() => setIsEditingUserProfile(true)} className="w-full sm:w-auto">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button onClick={handleSaveUserDetailProfile}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { 
                      setIsEditingUserProfile(false); 
                      setEditUserProfile(selectedUserForDetail.profile || {});
                      setEditUserUsername(selectedUserForDetail.username || '');
                      setEditUserEmail((selectedUserForDetail as any).email || '');
                      setEditUserPassword('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-4 md:gap-6">
            {/* Left Sidebar - Profile Card & Quick Stats */}
            <div className="space-y-4">
              <div className="card-premium p-4 md:p-4 md:p-6 text-center">
                <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 md:mb-4">
                  <UserIcon className="w-8 h-8 md:w-12 md:h-12 text-primary" />
                </div>
                <h2 className="font-serif text-lg md:text-xl font-bold text-foreground">
                  {profile?.fullName || selectedUserForDetail.username}
                </h2>
                <p className="text-sm text-muted-foreground capitalize mt-1">
                  {selectedUserForDetail.role === 'admin' ? 'Coach / Admin' : 'Student'}
                </p>
                {profile?.classDesignation && (
                  <p className="text-sm text-primary mt-2">{profile.classDesignation}</p>
                )}
              </div>

              {/* Quick Stats */}
              <div className="card-premium p-3 md:p-4">
                <h3 className="font-medium text-foreground mb-3 md:mb-4 text-sm md:text-base">Quick Stats</h3>
                <div className="space-y-2 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                      <Target className="w-4 h-4 text-primary" />
                      <span className="text-xs md:text-sm text-muted-foreground">Puzzles Solved</span>
                    </div>
                    <span className="font-semibold text-foreground text-sm text-sm">{totalPuzzlesCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <span className="text-xs md:text-sm text-muted-foreground">Attendance</span>
                    </div>
                    <span className="font-semibold text-foreground text-sm">{attendancePercentage}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                      <Trophy className="w-4 h-4 text-primary" />
                      <span className="text-xs md:text-sm text-muted-foreground">Achievements</span>
                    </div>
                    <span className="font-semibold text-foreground text-sm">{selectedUserForDetail.achievements?.length || 0}</span>
                  </div>
                </div>
              </div>

              {/* Fees */}
              <div className="card-premium p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    
                    <h3 className="font-medium text-foreground text-sm md:text-base">Fees</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleToggleCommonFeeNote}
                      className="p-1 h-6 w-6"
                      title="Common secret note for all fees"
                    >
                      {showCommonFeeNote ? (
                        <Eye className="w-4 h-4 text-blue-600" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      )}
                    </Button>
                  </div>
                  <Button size="sm" onClick={async () => {
                    // add current month fee
                    if (!selectedUserForDetail) return;
                    try {
                      const now = new Date();
                      const month = now.getMonth() + 1;
                      const year = now.getFullYear();
                      setIsLoadingFees(true);
                      const res = await fetch(`${API_BASE_URL}/users/${selectedUserForDetail.id}/fees`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ month, year, paid: false })
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setUserFees(data.fees || data);
                        // Update allUsersFees state
                        if (selectedUserForDetail?.id) {
                          setAllUsersFees(prev => ({
                            ...prev,
                            [selectedUserForDetail.id]: data.fees || data
                          }));
                        }
                        toast.success('Fee record added');
                      } else {
                        toast.error('Failed to add fee record');
                      }
                    } catch (err) {
                      console.error(err);
                      toast.error('Failed to add fee record');
                    } finally {
                      setIsLoadingFees(false);
                    }
                  }}>
                    <Plus className="w-4 h-4 mr-2" />Add
                  </Button>
                </div>
                
                {/* Common Secret Note Section */}
                {showCommonFeeNote && (
                  <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    {isEditingCommonFeeNote ? (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-blue-900 dark:text-blue-100">Common Secret Note (for all fees)</Label>
                        <Textarea
                          className="w-full text-xs resize-none"
                          rows={2}
                          placeholder="Add a common secret note for this student's fees..."
                          value={tempCommonFeeNote}
                          onChange={(e) => setTempCommonFeeNote(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 px-3 text-xs"
                            onClick={handleSaveCommonFeeNote}
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-3 text-xs"
                            onClick={handleCancelCommonFeeNote}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <Label className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1 block">Common Secret Note</Label>
                          <p className="text-xs text-blue-800 dark:text-blue-200">
                            {commonFeeNote || <span className="italic text-blue-600 dark:text-blue-400">No common note yet</span>}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => {
                            setTempCommonFeeNote(commonFeeNote);
                            setIsEditingCommonFeeNote(true);
                          }}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {userFees.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No fee records yet.</p>
                  ) : (
                    userFees.map((f) => {
                      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                      const label = `${monthNames[(f.month || 1)-1]} ${f.year}`;
                      const isEditingNote = editingSecretNote[f._id] !== undefined;
                      return (
                        <div key={f._id} className={`p-3 rounded-lg border ${f.paid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="text-sm font-medium">{label}</div>
                              <div className="text-xs text-muted-foreground">{f.paid ? 'Paid' : 'Not paid'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleSecretNoteVisibility(f._id, !f.secretVisible)}
                                className="h-6 w-6 p-0"
                                title={f.secretVisible ? 'Hide secret note' : 'Show secret note'}
                              >
                                {f.secretVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground" />}
                              </Button>
                              <Switch checked={!!f.paid} onCheckedChange={async (val) => {
                                try {
                                  const res = await fetch(`${API_BASE_URL}/users/${selectedUserForDetail?.id}/fees/${f._id}`, {
                                    method: 'PUT',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ paid: !!val })
                                  });
                                  if (res.ok) {
                                    const json = await res.json();
                                    // update local state
                                    const updatedFees = userFees.map(p => p._id === f._id ? json.fee || json : p);
                                    setUserFees(updatedFees);
                                    // Update allUsersFees state
                                    if (selectedUserForDetail?.id) {
                                      setAllUsersFees(prev => ({
                                        ...prev,
                                        [selectedUserForDetail.id]: updatedFees
                                      }));
                                    }
                                  } else {
                                    toast.error('Failed to update fee');
                                  }
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Failed to update fee');
                                }
                              }} />
                              <Button variant="ghost" size="sm" onClick={async () => {
                                if (!confirm('Delete this fee record?')) return;
                                try {
                                  const res = await fetch(`${API_BASE_URL}/users/${selectedUserForDetail?.id}/fees/${f._id}`, {
                                    method: 'DELETE',
                                    headers: {
                                      'Authorization': `Bearer ${token}`,
                                      'Content-Type': 'application/json'
                                    }
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    setUserFees(data.fees || data);
                                    // Update allUsersFees state
                                    if (selectedUserForDetail?.id) {
                                      setAllUsersFees(prev => ({
                                        ...prev,
                                        [selectedUserForDetail.id]: data.fees || data
                                      }));
                                    }
                                    toast.success('Fee record deleted');
                                  } else {
                                    const text = await res.text();
                                    console.error('Delete fee failed', res.status, text);
                                    toast.error(`Failed to delete fee: ${text || res.status}`);
                                  }
                                } catch (err) {
                                  console.error(err);
                                  toast.error('Failed to delete fee');
                                }
                              }}>
                                <Trash2 className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* Secret Note Section */}
                          {f.secretVisible && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              {isEditingNote ? (
                                <div className="space-y-2">
                                  <textarea
                                    className="w-full text-xs p-2 border rounded resize-none"
                                    rows={2}
                                    placeholder="Add secret note..."
                                    value={editingSecretNote[f._id] || ''}
                                    onChange={(e) => setEditingSecretNote(prev => ({
                                      ...prev,
                                      [f._id]: e.target.value
                                    }))}
                                  />
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => updateFeeSecretNote(f._id, editingSecretNote[f._id] || '')}
                                    >
                                      <Save className="w-3 h-3 mr-1" />
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => setEditingSecretNote(prev => {
                                        const newState = { ...prev };
                                        delete newState[f._id];
                                        return newState;
                                      })}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-xs text-gray-600 flex-1">
                                    {f.secretNote || <span className="italic text-gray-400">No secret note</span>}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 shrink-0"
                                    onClick={() => setEditingSecretNote(prev => ({
                                      ...prev,
                                      [f._id]: f.secretNote || ''
                                    }))}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Performance Overview */}
              <div className="card-premium p-3 md:p-4">
                <h3 className="font-medium text-foreground mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Performance
                </h3>
                <div className="space-y-2 md:space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Puzzle Completion</span>
                      <span className="font-medium">{completionRate}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all" 
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Attendance</span>
                      <span className="font-medium">{attendancePercentage}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-success h-2 rounded-full transition-all" 
                        style={{ width: `${attendancePercentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Content - Details */}
            <div className="space-y-4 md:space-y-6">
              {/* Personal Information */}
              <div className="card-premium p-4 md:p-6">
                <h3 className="font-serif text-base md:text-lg font-semibold text-foreground mb-3 md:mb-4">
                  Personal Information
                </h3>
                
                {isEditingUserProfile ? (
                  <div className="space-y-4">
                    {/* Account Information */}
                    <div className="pb-4 border-b border-border">
                      <h4 className="text-sm font-medium text-foreground mb-3">Account</h4>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="username">Username</Label>
                          <Input
                            id="username"
                            value={editUserUsername}
                            onChange={(e) => setEditUserUsername(e.target.value)}
                            placeholder="Username"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={editUserEmail}
                            onChange={(e) => setEditUserEmail(e.target.value)}
                            placeholder="email@example.com"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="password">New Password (leave blank to keep current)</Label>
                          <Input
                            id="password"
                            type="password"
                            value={editUserPassword}
                            onChange={(e) => setEditUserPassword(e.target.value)}
                            placeholder="Enter new password to change"
                          />
                          <p className="text-xs text-muted-foreground">
                            Only fill this if you want to change the user's password
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Personal Details */}
                    <div className="pb-4 border-b border-border">
                      <h4 className="text-sm font-medium text-foreground mb-3">Personal Details</h4>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="fullName">Full Name</Label>
                          <Input
                            id="fullName"
                            value={editUserProfile.fullName || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, fullName: e.target.value })}
                            placeholder="Full name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="dateOfBirth">Date of Birth</Label>
                          <Input
                            id="dateOfBirth"
                            type="date"
                            value={editUserProfile.dateOfBirth || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, dateOfBirth: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Phone Number</Label>
                          <Input
                            id="phone"
                            value={editUserProfile.phone || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, phone: e.target.value })}
                            placeholder="Phone number"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="profileEmail">Contact Email</Label>
                          <Input
                            id="profileEmail"
                            type="email"
                            value={editUserProfile.email || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, email: e.target.value })}
                            placeholder="Contact email"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Education */}
                    <div className="pb-4 border-b border-border">
                      <h4 className="text-sm font-medium text-foreground mb-3">Education</h4>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="class">Class</Label>
                          <Input
                            id="class"
                            value={editUserProfile.classDesignation || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, classDesignation: e.target.value })}
                            placeholder="e.g., 10th Grade"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="school">School Name</Label>
                          <Input
                            id="school"
                            value={editUserProfile.schoolName || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, schoolName: e.target.value })}
                            placeholder="School name"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-3">Location</h4>
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="village">Village/City</Label>
                          <Input
                            id="village"
                            value={editUserProfile.village || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, village: e.target.value })}
                            placeholder="Village or City"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="state">State</Label>
                          <Input
                            id="state"
                            value={editUserProfile.state || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, state: e.target.value })}
                            placeholder="State"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="country">Country</Label>
                          <Input
                            id="country"
                            value={editUserProfile.country || ''}
                            onChange={(e) => setEditUserProfile({ ...editUserProfile, country: e.target.value })}
                            placeholder="Country"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {profile?.email && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                        <Mail className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Email</p>
                          <p className="text-sm font-medium">{profile.email}</p>
                        </div>
                      </div>
                    )}
                    {profile?.phone && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                        <Phone className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Phone</p>
                          <p className="text-sm font-medium">{profile.phone}</p>
                        </div>
                      </div>
                    )}
                    {profile?.dateOfBirth && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                        <Calendar className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Date of Birth</p>
                          <p className="text-sm font-medium">{profile.dateOfBirth}</p>
                        </div>
                      </div>
                    )}
                    {profile?.schoolName && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                        <GraduationCap className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">School</p>
                          <p className="text-sm font-medium">{profile.schoolName}</p>
                        </div>
                      </div>
                    )}
                    {profile?.village && profile?.state && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 sm:col-span-2">
                        <MapPin className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Location</p>
                          <p className="text-sm font-medium">
                            {profile.village}, {profile.state}, {profile.country}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!profile && !isEditingUserProfile && (
                  <p className="text-muted-foreground text-center py-8">
                    Complete profile to see information here.
                  </p>
                )}
              </div>

              {/* Puzzle Progress by Category */}
              <div className="card-premium p-6">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Puzzle Progress by Category
                </h3>
                {userPuzzleProgress.length > 0 ? (
                  <div className="space-y-4">
                    {/* Summary Card */}
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Total Puzzles Completed</span>
                        <span className="text-xl font-bold text-primary">
                          {userPuzzleProgress.reduce((acc, cat) => acc + cat.solvedPuzzles, 0)} / {userPuzzleProgress.reduce((acc, cat) => acc + cat.totalPuzzles, 0)}
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-3 mt-2">
                        <div 
                          className="bg-primary h-3 rounded-full transition-all" 
                          style={{ 
                            width: `${(userPuzzleProgress.reduce((acc, cat) => acc + cat.solvedPuzzles, 0) / 
                              Math.max(userPuzzleProgress.reduce((acc, cat) => acc + cat.totalPuzzles, 0), 1)) * 100}%` 
                          }}
                        />
                      </div>
                    </div>

                    {userPuzzleProgress.map((category, idx) => (
                      <div key={idx} className="border border-border rounded-lg overflow-hidden">
                        {/* Category Header - Always Visible (Clickable) */}
                        <div 
                          className="p-4 bg-secondary/50 cursor-pointer hover:bg-secondary transition-colors"
                          onClick={() => togglePuzzleCategory(category.category)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-foreground flex items-center gap-2">
                              {category.category}
                              <ChevronRight 
                                className={`w-4 h-4 text-muted-foreground transition-transform ${
                                  expandedPuzzleCategories.has(category.category) ? 'rotate-90' : ''
                                }`}
                              />
                            </h4>
                            <span className={`text-sm font-medium ${
                              category.solvedPuzzles === category.totalPuzzles && category.totalPuzzles > 0
                                ? 'text-success'
                                : 'text-muted-foreground'
                            }`}>
                              {category.solvedPuzzles} / {category.totalPuzzles} completed
                              {category.solvedPuzzles === category.totalPuzzles && category.totalPuzzles > 0 && ' ✓'}
                            </span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2 mb-3">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                category.solvedPuzzles === category.totalPuzzles && category.totalPuzzles > 0
                                  ? 'bg-success'
                                  : 'bg-primary'
                              }`}
                              style={{ width: `${(category.solvedPuzzles / Math.max(category.totalPuzzles, 1)) * 100}%` }}
                            />
                          </div>
                          
                          {/* Accuracy Display - Always Visible */}
                          {categoryAccuracy[category.category] && categoryAccuracy[category.category].total > 0 && (
                            <div className="p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-blue-900 dark:text-blue-100 font-medium">Accuracy:</span>
                                <span className={`font-bold ${
                                  categoryAccuracy[category.category].accuracy >= 80 ? 'text-success' :
                                  categoryAccuracy[category.category].accuracy >= 60 ? 'text-warning' :
                                  'text-destructive'
                                }`}>
                                  {categoryAccuracy[category.category].accuracy}%
                                </span>
                              </div>
                              <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                {categoryAccuracy[category.category].correct} correct / {categoryAccuracy[category.category].total} attempted
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Expanded Puzzle Details - Hidden by Default */}
                        {expandedPuzzleCategories.has(category.category) && (
                          <div className="p-4 border-t border-border bg-card">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {category.puzzleDetails.map((puzzle, pidx) => (
                                <div 
                                  key={pidx}
                                  className={`text-xs p-2 rounded flex items-center gap-2 ${
                                    puzzle.solved 
                                      ? 'bg-success/10 text-success border border-success/20' 
                                      : 'bg-secondary/50 text-muted-foreground'
                                  }`}
                                  title={puzzle.puzzleName}
                                >
                                  {puzzle.solved ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                  <span className="truncate">Puzzle {pidx + 1}</span>
                                  {puzzle.attempts > 0 && (
                                    <span className="text-[10px] opacity-70">({puzzle.attempts} try)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No puzzle progress data available yet.
                  </p>
                )}
              </div>

              {/* Live Activity Feed */}
              <div className="card-premium p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h3 className="font-serif text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    Live Activity Feed
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                  </h3>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {/* Status Filter */}
                    <div className="inline-flex items-center bg-secondary rounded-md p-1">
                      <button
                        onClick={() => setActivityFilter('all')}
                        className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded ${activityFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setActivityFilter('solved')}
                        className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded ${activityFilter === 'solved' ? 'bg-success text-success-foreground' : 'text-muted-foreground'}`}
                      >
                        Solved
                      </button>
                      <button
                        onClick={() => setActivityFilter('failed')}
                        className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded ${activityFilter === 'failed' ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground'}`}
                      >
                        Failed
                      </button>
                    </div>

                    {/* Category Filter */}
                    <div className="inline-flex items-center bg-secondary rounded-md p-1">
                      <button
                        onClick={() => setActivityCategory('all')}
                        className={`flex-1 sm:flex-none px-2 py-1.5 text-xs rounded whitespace-nowrap ${activityCategory === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setActivityCategory('puzzles')}
                        className={`flex-1 sm:flex-none px-2 py-1.5 text-xs rounded whitespace-nowrap ${activityCategory === 'puzzles' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                      >
                        Puzzles
                      </button>
                      <button
                        onClick={() => setActivityCategory('games')}
                        className={`flex-1 sm:flex-none px-2 py-1.5 text-xs rounded whitespace-nowrap ${activityCategory === 'games' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                      >
                        Games
                      </button>
                      <button
                        onClick={() => setActivityCategory('openings')}
                        className={`flex-1 sm:flex-none px-2 py-1.5 text-xs rounded whitespace-nowrap ${activityCategory === 'openings' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                      >
                        Openings
                      </button>
                      <button
                        onClick={() => setActivityCategory('bestgames')}
                        className={`flex-1 sm:flex-none px-2 py-1.5 text-xs rounded whitespace-nowrap ${activityCategory === 'bestgames' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                      >
                        Best Games
                      </button>
                    </div>

                    {/* Summary - Hidden on very small screens */}
                    <div className="hidden md:flex text-xs text-muted-foreground px-2 gap-3">
                      <div>Rows: <span className="font-medium text-foreground">{activityRowsCount}</span></div>
                      <div>Time: <span className="font-medium text-foreground">{formatSecondsToHM(activityTotalSeconds)}</span></div>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => loadUserActivity(selectedUserForDetail.id)}
                      className="flex items-center gap-2 w-full sm:w-auto"
                    >
                          <RotateCcw className="w-3 h-3" />
                          Refresh
                        </Button>
                      </div>
                </div>
                
                {filteredActivities.length > 0 ? (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {filteredActivities.map((activity, idx) => {
                      const timestamp = new Date(activity.timestamp);
                      const isToday = timestamp.toDateString() === new Date().toDateString();
                      const isPuzzleActivity = activity.type === 'puzzle_solved' || activity.type === 'puzzle_failed';
                      
                      return (
                        <div 
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                            isPuzzleActivity 
                              ? activity.type === 'puzzle_solved'
                                ? 'bg-success/10 border border-success/20'
                                : 'bg-destructive/10 border border-destructive/20'
                              : 'bg-secondary/50 hover:bg-secondary'
                          }`}
                        >
                          <span className="text-xl flex-shrink-0">{getActivityIcon(activity.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${
                              activity.type === 'puzzle_solved' 
                                ? 'text-success' 
                                : activity.type === 'puzzle_failed'
                                  ? 'text-destructive'
                                  : 'text-foreground'
                            }`}>
                              {activity.description}
                            </p>
                            {activity.details && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {activity.details.puzzleNumber && (
                                  <span className="inline-flex items-center gap-1 mr-3 font-medium">
                                    🧩 Puzzle {activity.details.puzzleNumber}
                                  </span>
                                )}
                                {activity.details.category && (
                                  <span className="inline-flex items-center gap-1 mr-3">
                                    📂 {activity.details.category}
                                  </span>
                                )}
                                {activity.details.attempts && (
                                  <span className="inline-flex items-center gap-1 mr-3">
                                    🎯 {activity.details.attempts} attempt{activity.details.attempts > 1 ? 's' : ''}
                                  </span>
                                )}
                                {activity.details.timeSpent && (
                                  <span className="inline-flex items-center gap-1">
                                    ⏱️ {activity.details.timeSpent >= 60 
                                      ? `${Math.floor(activity.details.timeSpent / 60)} min ${activity.details.timeSpent % 60} sec`
                                      : `${activity.details.timeSpent} sec`
                                    }
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">
                                {isToday ? (
                                  <>
                                    Today at {timestamp.toLocaleTimeString('en-IN', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </>
                                ) : (
                                  timestamp.toLocaleString('en-IN', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-muted-foreground">No activity recorded yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Activity will appear here as the student uses the platform
                    </p>
                  </div>
                )}
              </div>

              {/* Attendance Record */}
              {selectedUserForDetail.role === 'student' && (
                <div className="card-premium p-6">
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
                    Attendance Record
                  </h3>
                  
                  {/* Joining Date */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 mb-4">
                    <Calendar className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Joining Date</p>
                      <p className="text-sm font-medium">
                        {selectedUserForDetail.joiningDate 
                          ? new Date(selectedUserForDetail.joiningDate as string).toLocaleDateString('en-IN', { 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })
                          : 'Not set'}
                      </p>
                    </div>
                  </div>

                  {/* Attendance Summary */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-3 rounded-lg bg-success/10">
                      <p className="text-2xl font-bold text-success">{presentCount}</p>
                      <p className="text-xs text-muted-foreground">Present</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-destructive/10">
                      <p className="text-2xl font-bold text-destructive">{absentCount}</p>
                      <p className="text-xs text-muted-foreground">Absent</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-primary/10">
                      <p className="text-2xl font-bold text-primary">{attendancePercentage}%</p>
                      <p className="text-xs text-muted-foreground">Rate</p>
                    </div>
                  </div>

                  {/* Recent Attendance */}
                  <h4 className="font-medium text-foreground mb-3">Attendance by Day</h4>
                  {userAttendance.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {[...userAttendance].reverse().slice(0, 20).map((record, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                        >
                          <div className="flex items-center gap-2">
                            {record.status === 'present' ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive" />
                            )}
                            <span className="text-sm">
                              {new Date(record.date).toLocaleDateString('en-IN', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            record.status === 'present'
                              ? 'bg-success/20 text-success'
                              : 'bg-destructive/20 text-destructive'
                          }`}>
                            {record.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No attendance records yet.
                    </p>
                  )}
                </div>
              )}

              {/* Achievements */}
              <div className="card-premium p-6">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
                  Achievements
                </h3>
                {selectedUserForDetail.achievements && selectedUserForDetail.achievements.length > 0 ? (
                  <div className="space-y-3">
                    {selectedUserForDetail.achievements.map((achievement, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50"
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-2xl">
                          {achievement.icon}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">{achievement.title}</h4>
                          <p className="text-sm text-muted-foreground">{achievement.description}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(achievement.date).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No achievements yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const statCards = [
    { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'text-primary' },
    { label: 'Active Students', value: stats.activeStudents, icon: UserCheck, color: 'text-success' },
    { label: 'Total Puzzles', value: stats.totalPuzzles, icon: Puzzle, color: 'text-accent' },
    { label: 'Total Openings', value: stats.totalOpenings, icon: BookOpen, color: 'text-warning' },
    { label: 'Best Games', value: stats.totalBestGames, icon: Trophy, color: 'text-brilliant' },
  ];

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Active Live Game - Takes Priority */}
        {currentGame && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
                Live Game with {currentGame.white.id === user?.id ? currentGame.black.username : currentGame.white.username}
              </h1>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-success/20 text-success text-sm">
                <Wifi className="w-4 h-4" />
                Live
              </div>
            </div>
            <LiveChessGame game={currentGame} onLeave={leaveGame} />
          </div>
        )}

        {/* Normal Dashboard Content - Hidden during live game */}
        {!currentGame && (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground">
                Manage users, puzzles, openings, and best games
              </p>
              {user && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => handleViewUserDetail(user)}>
                    <Settings className="w-4 h-4 mr-2" />
                    Edit My Account
                  </Button>
                </div>
              )}
            </div>

            {/* Game Requests Section */}
            {gameRequests.length > 0 && (
              <div className="mb-8">
                <div className="card-premium p-6 border-2 border-primary animate-pulse-border">
                  <div className="flex items-center gap-3 mb-4">
                    <Gamepad2 className="w-6 h-6 text-primary" />
                    <h2 className="font-serif text-xl font-semibold">
                      Game Requests ({gameRequests.length})
                    </h2>
                    {isSocketConnected && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
                        Connected
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {gameRequests.map((request) => (
                      <div 
                        key={request.id} 
                        className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{request.from.username}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {request.mode} game • {new Date(request.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => declineGameRequest(request.id)}
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedGameRequest(request);
                              setShowAcceptGameDialog(true);
                            }}
                            className="bg-primary hover:bg-primary/90"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            Accept
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Accept Game Dialog */}
            <Dialog open={showAcceptGameDialog} onOpenChange={setShowAcceptGameDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Timer className="w-5 h-5 text-primary" />
                    Set Game Time
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Accept game request from <span className="font-medium">{selectedGameRequest?.from.username}</span>
                    <br />
                    Game mode: <span className="capitalize">{selectedGameRequest?.mode}</span>
                  </p>
                  
                  <div className="space-y-3">
                    <Label>Time Control (per player)</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '3 min', value: 180 },
                        { label: '5 min', value: 300 },
                        { label: '10 min', value: 600 },
                        { label: '15 min', value: 900 },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setSelectedTimeControl(option.value)}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            selectedTimeControl === option.value
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <p className="text-lg font-bold">{option.label.split(' ')[0]}</p>
                          <p className="text-xs text-muted-foreground">min</p>
                        </button>
                      ))}
                    </div>
                    
                    <div className="pt-2">
                      <Label>Custom Time (minutes)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="60"
                        value={Math.floor(selectedTimeControl / 60)}
                        onChange={(e) => setSelectedTimeControl(parseInt(e.target.value) * 60 || 600)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAcceptGameDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedGameRequest) {
                        acceptGameRequest(selectedGameRequest.id, {
                          initial: selectedTimeControl,
                          increment: 0
                        });
                        setShowAcceptGameDialog(false);
                        toast.success(`Game started! ${Math.floor(selectedTimeControl / 60)} minutes per player`);
                      }
                    }}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Game
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              {statCards.map((stat, index) => (
                <div key={index} className="card-premium p-5">
                  <div className="flex items-center justify-between mb-3">
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

        {/* Tabs for Management */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-6 h-auto flex-wrap md:grid md:grid-cols-5">
            <TabsTrigger value="users" className="flex items-center gap-2 flex-1 min-w-[60px]">
              <Users className="w-4 h-4" /> <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="access" className="flex items-center gap-2 flex-1 min-w-[60px]">
              <Settings className="w-4 h-4" /> <span className="hidden sm:inline">Content Access</span>
            </TabsTrigger>
            <TabsTrigger value="puzzles" className="flex items-center gap-2 flex-1 min-w-[60px]">
              <Puzzle className="w-4 h-4" /> <span className="hidden sm:inline">Puzzles</span>
            </TabsTrigger>
            <TabsTrigger value="openings" className="flex items-center gap-2 flex-1 min-w-[60px]">
              <BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">Openings</span>
            </TabsTrigger>
            <TabsTrigger value="bestgames" className="flex items-center gap-2 flex-1 min-w-[60px]">
              <Trophy className="w-4 h-4" /> <span className="hidden sm:inline">Best Games</span>
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="card-premium p-4 md:p-6">
              <div className="flex flex-col gap-3 mb-4">
                <h2 className="font-serif text-xl font-semibold">User Management</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={handleOpenBulkAttendance} className="flex items-center justify-center gap-2 text-sm">
                    <CalendarDays className="w-4 h-4" /> Mark Attendance
                  </Button>
                  <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center justify-center gap-2 text-sm">
                        <Plus className="w-4 h-4" /> Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div>
                          <Label>Username</Label>
                          <Input
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                            placeholder="Enter username"
                          />
                        </div>
                        <div>
                          <Label>Password</Label>
                          <Input
                            type="password"
                            value={newUser.password}
                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                            placeholder="Enter password"
                          />
                        </div>
                        <div>
                          <Label>Role</Label>
                          <Select value={newUser.role} onValueChange={(value: 'admin' | 'student') => setNewUser({ ...newUser, role: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="student">Student</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button onClick={handleAddUser} className="w-full">
                          <Save className="w-4 h-4 mr-2" /> Add User
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Click on any user row to view detailed profile, activity, and edit credentials (username, email, password)
              </p>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-muted-foreground border-b border-border">
                      <th className="pb-3 font-medium">Username</th>
                      <th className="pb-3 font-medium">Role</th>
                      <th className="pb-3 font-medium">Joining Date</th>
                      <th className="pb-3 font-medium">Today's Attendance</th>
                      <th className="pb-3 font-medium">Account Access</th>
                      <th className="pb-3 font-medium">Content Access</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const todayAttendance = getTodayAttendance(u);
                      const hasUnpaid = hasUnpaidFees(u.id);
                      return (
                        <tr 
                          key={u.id} 
                          className={`border-b last:border-0 cursor-pointer transition-colors ${
                            hasUnpaid 
                              ? 'bg-red-100/80 hover:bg-red-100' 
                              : 'border-border hover:bg-secondary/30'
                          }`}
                          onClick={() => handleViewUserDetail(u)}
                        >
                          <td className="py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-primary font-semibold">
                                  {u.username.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium text-foreground flex items-center gap-2">
                                  {u.username}
                                  <Eye className="w-3 h-3 text-muted-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {u.profile?.fullName || 'No profile'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              u.role === 'admin' 
                                ? 'bg-primary/20 text-primary' 
                                : 'bg-secondary text-secondary-foreground'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-4">
                            {u.role === 'student' ? (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                {u.joiningDate ? (
                                  <span className="text-sm text-foreground">
                                    {new Date(u.joiningDate).toLocaleDateString()}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Not set</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEditUser(u)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-4">
                            {u.role === 'student' ? (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                {todayAttendance ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                    todayAttendance.status === 'present'
                                      ? 'bg-success/20 text-success'
                                      : 'bg-destructive/20 text-destructive'
                                  }`}>
                                    {todayAttendance.status === 'present' ? (
                                      <Check className="w-3 h-3" />
                                    ) : (
                                      <XCircle className="w-3 h-3" />
                                    )}
                                    {todayAttendance.status}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Not marked</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenAttendanceModal(u)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Calendar className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={u.isEnabled}
                                onCheckedChange={() => handleToggleUserAccess(u.id, u.isEnabled)}
                                disabled={u.id === user?.id}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className={`text-sm font-medium ${u.isEnabled ? 'text-success' : 'text-destructive'}`}>
                                {u.isEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </td>
                          <td className="py-4" onClick={(e) => e.stopPropagation()}>
                            {u.role === 'student' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenAccessModal(u)}
                                className="flex items-center gap-2"
                              >
                                <Settings className="w-4 h-4" />
                                Manage Access
                              </Button>
                            )}
                            {u.role === 'admin' && (
                              <span className="text-sm text-muted-foreground">Full Access</span>
                            )}
                          </td>
                          <td className="py-4" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={u.id === user?.id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Edit User Profile Modal - Comprehensive */}
            <Dialog open={showEditUserModal} onOpenChange={setShowEditUserModal}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Edit className="w-5 h-5" />
                    Edit Profile: {editingUser?.username}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  {/* Profile Information */}
                  <div className="card-premium p-4">
                    <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Profile Information
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Full Name</p>
                        <p className="font-medium">{editingUser?.profile?.fullName || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Class</p>
                        <p className="font-medium">{editingUser?.profile?.classDesignation || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Phone</p>
                        <p className="font-medium">{editingUser?.profile?.phone || 'Not set'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Email</p>
                        <p className="font-medium">{editingUser?.profile?.email || 'Not set'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Joining Date */}
                  <div>
                    <Label className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4" />
                      Joining Date
                    </Label>
                    <Input
                      type="date"
                      value={editUserJoiningDate}
                      onChange={(e) => setEditUserJoiningDate(e.target.value)}
                    />
                  </div>

                  {/* Achievements Management */}
                  <div className="card-premium p-4">
                    <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      Achievements
                    </h3>
                    
                    {/* Existing Achievements */}
                    {editUserAchievements.length > 0 ? (
                      <div className="space-y-2 mb-4">
                        {editUserAchievements.map((achievement, index) => (
                          <div key={index} className="flex items-start justify-between p-3 rounded-lg bg-secondary/50">
                            <div className="flex items-start gap-3 flex-1">
                              <span className="text-2xl">{achievement.icon}</span>
                              <div>
                                <p className="font-medium text-foreground">{achievement.title}</p>
                                <p className="text-sm text-muted-foreground">{achievement.description}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(achievement.date).toLocaleDateString('en-IN', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveAchievement(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-3 mb-4">No achievements yet</p>
                    )}

                    {/* Add New Achievement */}
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium mb-3">Add New Achievement</p>
                      <div className="space-y-3">
                        <div className="grid grid-cols-[auto,1fr] gap-3">
                          <div>
                            <Label className="text-xs">Icon</Label>
                            <Input
                              value={newAchievement.icon}
                              onChange={(e) => setNewAchievement({ ...newAchievement, icon: e.target.value })}
                              placeholder="🏆"
                              className="w-16 text-center text-lg"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Title *</Label>
                            <Input
                              value={newAchievement.title}
                              onChange={(e) => setNewAchievement({ ...newAchievement, title: e.target.value })}
                              placeholder="e.g., First Victory"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={newAchievement.description}
                            onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
                            placeholder="e.g., Won your first game"
                          />
                        </div>
                        <Button onClick={handleAddAchievement} variant="outline" className="w-full">
                          <Plus className="w-4 h-4 mr-2" /> Add Achievement
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Save Button */}
                  <Button onClick={handleSaveUserProfile} className="w-full">
                    <Save className="w-4 h-4 mr-2" /> Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Individual Attendance Modal */}
            <Dialog open={showAttendanceModal} onOpenChange={setShowAttendanceModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Mark Attendance for {selectedUserForAttendance?.username}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={attendanceDate}
                      onChange={(e) => setAttendanceDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={attendanceStatus} onValueChange={(value: 'present' | 'absent') => setAttendanceStatus(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Note (optional)</Label>
                    <Input
                      value={attendanceNote}
                      onChange={(e) => setAttendanceNote(e.target.value)}
                      placeholder="Add a note..."
                    />
                  </div>
                  <Button onClick={handleMarkAttendance} className="w-full">
                    <Save className="w-4 h-4 mr-2" /> Mark Attendance
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Bulk Attendance Modal */}
            <Dialog open={showBulkAttendance} onOpenChange={setShowBulkAttendance}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5" />
                    Bulk Attendance
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={bulkAttendanceDate}
                      onChange={(e) => setBulkAttendanceDate(e.target.value)}
                    />
                  </div>
                  
                  <div className="border rounded-lg divide-y">
                    {users.filter(u => u.role === 'student').map((u) => (
                      <div key={u.id} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-primary text-sm font-semibold">
                              {u.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-sm">{u.username}</p>
                            <p className="text-xs text-muted-foreground">{u.profile?.fullName || 'No name'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={bulkAttendance[u.id]?.status === 'present' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setBulkAttendance({
                              ...bulkAttendance,
                              [u.id]: { ...bulkAttendance[u.id], status: 'present' }
                            })}
                            className={bulkAttendance[u.id]?.status === 'present' ? 'bg-success hover:bg-success/80' : ''}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant={bulkAttendance[u.id]?.status === 'absent' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setBulkAttendance({
                              ...bulkAttendance,
                              [u.id]: { ...bulkAttendance[u.id], status: 'absent' }
                            })}
                            className={bulkAttendance[u.id]?.status === 'absent' ? 'bg-destructive hover:bg-destructive/80' : ''}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button onClick={handleSaveBulkAttendance} className="w-full">
                    <Save className="w-4 h-4 mr-2" /> Save All Attendance
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Content Access Modal */}
            <Dialog open={showAccessModal} onOpenChange={setShowAccessModal}>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Content Access for {selectedUserForAccess?.username}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (selectedUserForAccess) {
                          await loadUserPuzzleProgress(selectedUserForAccess.id);
                          toast.success('Puzzle progress refreshed');
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Refresh
                    </Button>
                  </DialogTitle>
                </DialogHeader>
                
                {userContentAccess && (
                  <div className="space-y-6 mt-4">
                    {/* Puzzle Access */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <Puzzle className="w-5 h-5" /> Puzzle Access
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {allPuzzleCategories.map((cat) => {
                          const hasIncomplete = hasIncompletePuzzlesInRange(cat.id);
                          const incompletePuzzles = getIncompletePuzzles(cat.id);
                          return (
                          <div key={cat.id} className={`p-4 rounded-lg transition-colors ${
                            hasIncomplete 
                              ? 'bg-red-100 border-2 border-red-400' 
                              : 'bg-secondary/50'
                          }`}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{cat.icon}</span>
                                <span className="font-medium">{cat.name}</span>
                              </div>
                              <Switch
                                checked={userContentAccess.puzzleAccess?.[cat.id]?.enabled || false}
                                onCheckedChange={(checked) => updatePuzzleAccess(cat.id, 'enabled', checked)}
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm text-muted-foreground">Puzzle Limit:</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max={puzzleCounts[cat.id] || 100}
                                  value={userContentAccess.puzzleAccess?.[cat.id]?.limit || 0}
                                  onChange={(e) => updatePuzzleAccess(cat.id, 'limit', parseInt(e.target.value) || 0)}
                                  className="w-20 h-8"
                                  disabled={!userContentAccess.puzzleAccess?.[cat.id]?.enabled}
                                />
                                <span className="text-sm text-muted-foreground">
                                  / {puzzleCounts[cat.id] || 0} available
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-sm text-muted-foreground">Range:</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  max={puzzleCounts[cat.id] || 100}
                                  placeholder="Start"
                                  value={userContentAccess.puzzleAccess?.[cat.id]?.rangeStart || ''}
                                  onChange={(e) => updatePuzzleAccess(cat.id, 'rangeStart', e.target.value ? parseInt(e.target.value) : null)}
                                  className="w-16 h-8"
                                  disabled={!userContentAccess.puzzleAccess?.[cat.id]?.enabled}
                                />
                                <span className="text-sm text-muted-foreground">to</span>
                                <Input
                                  type="number"
                                  min="1"
                                  max={puzzleCounts[cat.id] || 100}
                                  placeholder="End"
                                  value={userContentAccess.puzzleAccess?.[cat.id]?.rangeEnd || ''}
                                  onChange={(e) => updatePuzzleAccess(cat.id, 'rangeEnd', e.target.value ? parseInt(e.target.value) : null)}
                                  className="w-16 h-8"
                                  disabled={!userContentAccess.puzzleAccess?.[cat.id]?.enabled}
                                />
                              </div>
                            </div>
                            <div className="text-xs mt-2">
                              {userContentAccess.puzzleAccess?.[cat.id]?.enabled 
                                ? userContentAccess.puzzleAccess?.[cat.id]?.rangeStart && userContentAccess.puzzleAccess?.[cat.id]?.rangeEnd
                                  ? (
                                    <>
                                      <p className="text-muted-foreground mb-1">
                                        ✓ Puzzles {userContentAccess.puzzleAccess?.[cat.id]?.rangeStart}-{userContentAccess.puzzleAccess?.[cat.id]?.rangeEnd} unlocked
                                      </p>
                                      {incompletePuzzles.length > 0 && (
                                        <div className="mt-2 p-2 bg-red-50 border border-red-300 rounded">
                                          <p className="font-semibold text-red-700 mb-1">Not Completed:</p>
                                          <ul className="space-y-0.5">
                                            {incompletePuzzles.map((puzzle) => (
                                              <li key={puzzle.number} className="text-red-600">
                                                Puzzle #{puzzle.number} ({puzzle.name})
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </>
                                  )
                                  : userContentAccess.puzzleAccess?.[cat.id]?.limit === 0 
                                    ? <p className="text-muted-foreground">✓ All puzzles unlocked</p>
                                    : <p className="text-muted-foreground">✓ First {userContentAccess.puzzleAccess?.[cat.id]?.limit} puzzles unlocked</p>
                                : <p className="text-muted-foreground">🔒 Category locked</p>}
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    </div>

                    {/* Opening Access */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <BookOpen className="w-5 h-5" /> Opening Access
                      </h3>
                      <div className="p-4 bg-secondary/50 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Enable Openings</span>
                          <Switch
                            checked={userContentAccess.openingAccess?.enabled || false}
                            onCheckedChange={(checked) => setUserContentAccess({
                              ...userContentAccess,
                              openingAccess: { ...userContentAccess.openingAccess, enabled: checked, allowedOpenings: checked ? [] : [] }
                            })}
                          />
                        </div>
                        
                        {userContentAccess.openingAccess?.enabled && openings.length > 0 && (
                          <div className="space-y-2 max-h-60 overflow-y-auto border-t border-border pt-3">
                            <p className="text-xs text-muted-foreground mb-2">Select which openings to unlock:</p>
                            {openings.map((opening) => {
                              const isAllowed = userContentAccess.openingAccess?.allowedOpenings?.includes(opening._id || '') || false;
                              return (
                                <label key={opening._id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    onChange={(e) => {
                                      const currentAllowed = userContentAccess.openingAccess?.allowedOpenings || [];
                                      const newAllowed = e.target.checked
                                        ? [...currentAllowed, opening._id!]
                                        : currentAllowed.filter(id => id !== opening._id);
                                      setUserContentAccess({
                                        ...userContentAccess,
                                        openingAccess: { ...userContentAccess.openingAccess, enabled: true, allowedOpenings: newAllowed }
                                      });
                                    }}
                                    className="rounded border-gray-300"
                                  />
                                  <span className="text-sm flex-1">{opening.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        
                        <p className="text-xs text-muted-foreground">
                          {!userContentAccess.openingAccess?.enabled 
                            ? '🔒 All openings are locked'
                            : userContentAccess.openingAccess?.allowedOpenings?.length === 0
                              ? '✓ All openings unlocked'
                              : `✓ ${userContentAccess.openingAccess?.allowedOpenings?.length} opening(s) unlocked`
                          }
                        </p>
                      </div>
                    </div>

                    {/* Famous Mates Access */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <Crown className="w-5 h-5" /> Famous Mates Access
                      </h3>
                      <div className="p-4 bg-secondary/50 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Enable Famous Mates</span>
                          <Switch
                            checked={userContentAccess.famousMatesAccess?.enabled || false}
                            onCheckedChange={(checked) => setUserContentAccess({
                              ...userContentAccess,
                              famousMatesAccess: { ...userContentAccess.famousMatesAccess, enabled: checked, allowedMates: checked ? [] : [] }
                            })}
                          />
                        </div>
                        
                        {userContentAccess.famousMatesAccess?.enabled && famousMates.length > 0 && (
                          <div className="space-y-2 max-h-60 overflow-y-auto border-t border-border pt-3">
                            <p className="text-xs text-muted-foreground mb-2">Select which famous mates to unlock:</p>
                            {famousMates.map((mate) => {
                              const isAllowed = userContentAccess.famousMatesAccess?.allowedMates?.includes(mate._id || '') || false;
                              return (
                                <label key={mate._id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    onChange={(e) => {
                                      const currentAllowed = userContentAccess.famousMatesAccess?.allowedMates || [];
                                      const newAllowed = e.target.checked
                                        ? [...currentAllowed, mate._id!]
                                        : currentAllowed.filter(id => id !== mate._id);
                                      setUserContentAccess({
                                        ...userContentAccess,
                                        famousMatesAccess: { ...userContentAccess.famousMatesAccess, enabled: true, allowedMates: newAllowed }
                                      });
                                    }}
                                    className="rounded border-gray-300"
                                  />
                                  <span className="text-sm flex-1">{mate.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        
                        <p className="text-xs text-muted-foreground">
                          {!userContentAccess.famousMatesAccess?.enabled 
                            ? '🔒 All famous mates are locked'
                            : userContentAccess.famousMatesAccess?.allowedMates?.length === 0
                              ? '✓ All famous mates unlocked'
                              : `✓ ${userContentAccess.famousMatesAccess?.allowedMates?.length} mate(s) unlocked`
                          }
                        </p>
                      </div>
                    </div>

                    {/* Best Games Access */}
                    <div>
                      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                        <Trophy className="w-5 h-5" /> Best Games Access
                      </h3>
                      <div className="p-4 bg-secondary/50 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Enable Best Games</span>
                          <Switch
                            checked={userContentAccess.bestGamesAccess?.enabled || false}
                            onCheckedChange={(checked) => setUserContentAccess({
                              ...userContentAccess,
                              bestGamesAccess: { ...userContentAccess.bestGamesAccess, enabled: checked, allowedGames: checked ? [] : [] }
                            })}
                          />
                        </div>
                        
                        {userContentAccess.bestGamesAccess?.enabled && bestGames.length > 0 && (
                          <div className="space-y-2 max-h-60 overflow-y-auto border-t border-border pt-3">
                            <p className="text-xs text-muted-foreground mb-2">Select which best games to unlock:</p>
                            {bestGames.map((game) => {
                              const isAllowed = userContentAccess.bestGamesAccess?.allowedGames?.includes(game._id || '') || false;
                              return (
                                <label key={game._id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isAllowed}
                                    onChange={(e) => {
                                      const currentAllowed = userContentAccess.bestGamesAccess?.allowedGames || [];
                                      const newAllowed = e.target.checked
                                        ? [...currentAllowed, game._id!]
                                        : currentAllowed.filter(id => id !== game._id);
                                      setUserContentAccess({
                                        ...userContentAccess,
                                        bestGamesAccess: { ...userContentAccess.bestGamesAccess, enabled: true, allowedGames: newAllowed }
                                      });
                                    }}
                                    className="rounded border-gray-300"
                                  />
                                  <span className="text-sm flex-1">{game.title}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        
                        <p className="text-xs text-muted-foreground">
                          {!userContentAccess.bestGamesAccess?.enabled 
                            ? '🔒 All best games are locked'
                            : userContentAccess.bestGamesAccess?.allowedGames?.length === 0
                              ? '✓ All best games unlocked'
                              : `✓ ${userContentAccess.bestGamesAccess?.allowedGames?.length} game(s) unlocked`
                          }
                        </p>
                      </div>
                    </div>

                    <Button onClick={handleUpdateContentAccess} className="w-full">
                      <Save className="w-4 h-4 mr-2" /> Save Content Access
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Content Access Tab - Bulk Management */}
          <TabsContent value="access">
            <div className="card-premium p-6">
              <div className="mb-6">
                <h2 className="font-serif text-xl font-semibold mb-2">Bulk Content Access Control</h2>
                <p className="text-muted-foreground">
                  Manage content access for all students at once. Changes apply to all student accounts.
                </p>
              </div>

              <div className="space-y-8">
                {/* Puzzle Categories */}
                <div>
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Puzzle className="w-5 h-5 text-primary" /> Puzzle Categories
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allPuzzleCategories.map((cat) => (
                      <div key={cat.id} className="p-5 bg-secondary/30 rounded-xl border border-border">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <span className="text-2xl">{cat.icon}</span>
                          </div>
                          <div>
                            <h4 className="font-semibold">{cat.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {puzzleCounts[cat.id] || 0} puzzles available
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => handleBulkUpdateAccess(
                              { [cat.id]: { enabled: true, limit: 0 } },
                              { enabled: false, allowedOpenings: [] },
                              { enabled: false, allowedMates: [] },
                              { enabled: false, allowedGames: [] }
                            )}
                          >
                            <Unlock className="w-4 h-4 mr-2 text-success" />
                            Unlock All for Everyone
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => handleBulkUpdateAccess(
                              { [cat.id]: { enabled: true, limit: 5 } },
                              { enabled: false, allowedOpenings: [] },
                              { enabled: false, allowedMates: [] },
                              { enabled: false, allowedGames: [] }
                            )}
                          >
                            <Eye className="w-4 h-4 mr-2 text-warning" />
                            Unlock First 5 for Everyone
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => handleBulkUpdateAccess(
                              { [cat.id]: { enabled: false, limit: 0 } },
                              { enabled: false, allowedOpenings: [] },
                              { enabled: false, allowedMates: [] },
                              { enabled: false, allowedGames: [] }
                            )}
                          >
                            <Lock className="w-4 h-4 mr-2 text-destructive" />
                            Lock for Everyone
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Openings */}
                <div>
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" /> Openings
                  </h3>
                  <div className="p-5 bg-secondary/30 rounded-xl border border-border">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-semibold">All Openings</h4>
                        <p className="text-sm text-muted-foreground">{openings.length} openings available</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => handleBulkUpdateAccess(
                          {},
                          { enabled: true, allowedOpenings: [] },
                          { enabled: false, allowedMates: [] },
                          { enabled: false, allowedGames: [] }
                        )}
                      >
                        <Unlock className="w-4 h-4 mr-2 text-success" />
                        Unlock for All Students
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleBulkUpdateAccess(
                          {},
                          { enabled: false, allowedOpenings: [] },
                          { enabled: false, allowedMates: [] },
                          { enabled: false, allowedGames: [] }
                        )}
                      >
                        <Lock className="w-4 h-4 mr-2 text-destructive" />
                        Lock for All Students
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Best Games */}
                <div>
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-primary" /> Best Games
                  </h3>
                  <div className="p-5 bg-secondary/30 rounded-xl border border-border">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-semibold">All Best Games</h4>
                        <p className="text-sm text-muted-foreground">{bestGames.length} games available</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => handleBulkUpdateAccess(
                          {},
                          { enabled: false, allowedOpenings: [] },
                          { enabled: false, allowedMates: [] },
                          { enabled: true, allowedGames: [] }
                        )}
                      >
                        <Unlock className="w-4 h-4 mr-2 text-success" />
                        Unlock for All Students
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleBulkUpdateAccess(
                          {},
                          { enabled: false, allowedOpenings: [] },
                          { enabled: false, allowedMates: [] },
                          { enabled: false, allowedGames: [] }
                        )}
                      >
                        <Lock className="w-4 h-4 mr-2 text-destructive" />
                        Lock for All Students
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Famous Mates */}
                <div>
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Crown className="w-5 h-5 text-primary" /> Famous Mates
                  </h3>
                  <div className="p-5 bg-secondary/30 rounded-xl border border-border">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-semibold">All Famous Mates</h4>
                        <p className="text-sm text-muted-foreground">{famousMates.length} famous mates available</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => handleBulkUpdateAccess(
                          {},
                          { enabled: false, allowedOpenings: [] },
                          { enabled: true, allowedMates: [] },
                          { enabled: false, allowedGames: [] }
                        )}
                      >
                        <Unlock className="w-4 h-4 mr-2 text-success" />
                        Unlock for All Students
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleBulkUpdateAccess(
                          {},
                          { enabled: false, allowedOpenings: [] },
                          { enabled: false, allowedMates: [] },
                          { enabled: false, allowedGames: [] }
                        )}
                      >
                        <Lock className="w-4 h-4 mr-2 text-destructive" />
                        Lock for All Students
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Selective Access */}
              <div className="mt-6 p-5 bg-secondary/20 rounded-xl border border-border">
                <h3 className="font-semibold text-lg mb-3">Selective Access Assignment</h3>
                <p className="text-sm text-muted-foreground mb-3">Choose a content type and an item, then select students to grant access.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <Label>Content Type</Label>
                    <Select value={bulkSelectionType} onValueChange={(val: any) => { setBulkSelectionType(val); setSelectedContentItemId(null); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openings">Openings</SelectItem>
                        <SelectItem value="famousMates">Famous Mates</SelectItem>
                        <SelectItem value="bestGames">Best Games</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2">
                    <Label>Select Item</Label>
                    <Select value={selectedContentItemId || ''} onValueChange={(val: any) => setSelectedContentItemId(val || null)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {bulkSelectionType === 'openings' && openings.map(o => (
                          <SelectItem key={o._id} value={o._id}>{o.name}</SelectItem>
                        ))}
                        {bulkSelectionType === 'famousMates' && famousMates.map(f => (
                          <SelectItem key={f._id} value={f._id}>{f.name}</SelectItem>
                        ))}
                        {bulkSelectionType === 'bestGames' && bestGames.map(b => (
                          <SelectItem key={b._id} value={b._id}>{b.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Students</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        const all: { [id: string]: boolean } = {};
                        users.filter(u => u.role === 'student').forEach(u => { all[u.id] = true; });
                        setSelectedStudentsForBulk(all);
                      }}>Select All</Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedStudentsForBulk({})}>Clear</Button>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded p-2">
                    {users.filter(u => u.role === 'student').map(u => (
                      <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-secondary/50 rounded">
                        <input type="checkbox" checked={!!selectedStudentsForBulk[u.id]} onChange={(e) => setSelectedStudentsForBulk({ ...selectedStudentsForBulk, [u.id]: e.target.checked })} />
                        <div className="flex-1">
                          <div className="font-medium">{u.username}</div>
                          <div className="text-xs text-muted-foreground">{u.profile?.fullName || 'No name'}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={async () => {
                    if (!selectedContentItemId) {
                      toast.error('Please select an item');
                      return;
                    }

                    const studentList = users.filter(u => u.role === 'student');
                    if (studentList.length === 0) {
                      toast.error('No students found');
                      return;
                    }

                    toast.loading('Updating access...');

                    const results = await Promise.allSettled(studentList.map(async (stu) => {
                      try {
                        const resp = await fetch(`${API_BASE_URL}/content-access/${stu.id}`, {
                          headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (!resp.ok) throw new Error('Failed to load access');
                        const access: ContentAccess = await resp.json();

                        // compute new access per user
                        if (bulkSelectionType === 'openings') {
                          let openingAccess = access.openingAccess || { enabled: false, allowedOpenings: [] };
                          const currentlyHas = openingAccess.allowedOpenings?.includes(selectedContentItemId!);
                          const shouldHave = !!selectedStudentsForBulk[stu.id];

                          if (shouldHave && !currentlyHas) {
                            // add
                            const newAllowed = Array.from(new Set([...(openingAccess.allowedOpenings || []), selectedContentItemId!]));
                            openingAccess = { enabled: true, allowedOpenings: newAllowed };
                          } else if (!shouldHave && currentlyHas) {
                            // remove
                            // if allowedOpenings empty means "all unlocked" — convert to explicit list then remove
                            let currentList = openingAccess.allowedOpenings || [];
                            if (openingAccess.enabled && currentList.length === 0) {
                              currentList = openings.map(o => o._id!).filter(Boolean) as string[];
                            }
                            const newAllowed = currentList.filter(id => id !== selectedContentItemId);
                            openingAccess = { enabled: newAllowed.length === 0 ? false : true, allowedOpenings: newAllowed };
                          }

                          await fetch(`${API_BASE_URL}/content-access/${stu.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ openingAccess })
                          });
                        }

                        if (bulkSelectionType === 'famousMates') {
                          let famousMatesAccess = access.famousMatesAccess || { enabled: false, allowedMates: [] };
                          const currentlyHas = famousMatesAccess.allowedMates?.includes(selectedContentItemId!);
                          const shouldHave = !!selectedStudentsForBulk[stu.id];

                          if (shouldHave && !currentlyHas) {
                            const newAllowed = Array.from(new Set([...(famousMatesAccess.allowedMates || []), selectedContentItemId!]));
                            famousMatesAccess = { enabled: true, allowedMates: newAllowed };
                          } else if (!shouldHave && currentlyHas) {
                            let currentList = famousMatesAccess.allowedMates || [];
                            if (famousMatesAccess.enabled && currentList.length === 0) {
                              currentList = famousMates.map(f => f._id!).filter(Boolean) as string[];
                            }
                            const newAllowed = currentList.filter(id => id !== selectedContentItemId);
                            famousMatesAccess = { enabled: newAllowed.length === 0 ? false : true, allowedMates: newAllowed };
                          }

                          await fetch(`${API_BASE_URL}/content-access/${stu.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ famousMatesAccess })
                          });
                        }

                        if (bulkSelectionType === 'bestGames') {
                          let bestGamesAccess = access.bestGamesAccess || { enabled: false, allowedGames: [] };
                          const currentlyHas = bestGamesAccess.allowedGames?.includes(selectedContentItemId!);
                          const shouldHave = !!selectedStudentsForBulk[stu.id];

                          if (shouldHave && !currentlyHas) {
                            const newAllowed = Array.from(new Set([...(bestGamesAccess.allowedGames || []), selectedContentItemId!]));
                            bestGamesAccess = { enabled: true, allowedGames: newAllowed };
                          } else if (!shouldHave && currentlyHas) {
                            let currentList = bestGamesAccess.allowedGames || [];
                            if (bestGamesAccess.enabled && currentList.length === 0) {
                              currentList = bestGames.map(b => b._id!).filter(Boolean) as string[];
                            }
                            const newAllowed = currentList.filter(id => id !== selectedContentItemId);
                            bestGamesAccess = { enabled: newAllowed.length === 0 ? false : true, allowedGames: newAllowed };
                          }

                          await fetch(`${API_BASE_URL}/content-access/${stu.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ bestGamesAccess })
                          });
                        }

                        return { ok: true, userId: stu.id };
                      } catch (err) {
                        return { ok: false, userId: stu.id };
                      }
                    }));

                    const succeeded = results.filter(r => (r as any).status === 'fulfilled' && (r as any).value.ok).length;
                    toast.dismiss();
                    toast.success(`Updated access for ${succeeded}/${studentList.length} students`);
                    // refresh users/content if needed
                    await Promise.all([loadUsers(), loadStats()]);
                  }}>
                    <Save className="w-4 h-4 mr-2" /> Save Selected
                  </Button>
                  <Button variant="outline" onClick={() => { setSelectedContentItemId(null); setSelectedStudentsForBulk({}); }}>Cancel</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Puzzles Tab */}
          <TabsContent value="puzzles">
            <div className="card-premium p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-xl font-semibold">Puzzle Management</h2>
                <Dialog open={showAddPuzzle} onOpenChange={setShowAddPuzzle}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add Puzzle
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Puzzle - Visual Board Editor</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Name *</Label>
                          <Input
                            value={newPuzzle.name}
                            onChange={(e) => setNewPuzzle({ ...newPuzzle, name: e.target.value })}
                            placeholder="e.g., Mate in 1 - Puzzle 1"
                          />
                        </div>
                        <div>
                          <Label>Category *</Label>
                          <Select value={newPuzzle.category} onValueChange={(value) => setNewPuzzle({ ...newPuzzle, category: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mate-in-1">Mate in 1</SelectItem>
                              <SelectItem value="mate-in-2">Mate in 2</SelectItem>
                              <SelectItem value="mate-in-3">Mate in 3</SelectItem>
                              <SelectItem value="pins">Pins</SelectItem>
                              <SelectItem value="forks">Forks</SelectItem>
                              <SelectItem value="traps">Traps</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea
                          value={newPuzzle.description}
                          onChange={(e) => setNewPuzzle({ ...newPuzzle, description: e.target.value })}
                          placeholder="Describe the puzzle"
                        />
                      </div>
                      
                      {/* Visual Board Editor */}
                      <div className="border rounded-lg p-4 bg-secondary/20">
                        <Label className="text-base font-medium mb-3 block">Set Position & Solution Visually</Label>
                        <p className="text-sm text-muted-foreground mb-4">
                          1. Click a piece on the left, then click the board to place it.<br/>
                          2. Set whose turn it is (White/Black to move).<br/>
                          3. Click "Next: Record Solution" when position is ready.<br/>
                          4. Make the correct move(s) on the board.<br/>
                          5. Click "Save Position & Solution".
                        </p>
                        <VisualBoardEditor
                          onPositionSave={(fen, solution) => {
                            setNewPuzzle({ ...newPuzzle, fen, solution });
                          }}
                        />
                        {newPuzzle.fen && (
                          <div className="mt-3 p-2 bg-success/10 border border-success/20 rounded text-sm">
                            <strong>✓ Position & Solution saved!</strong><br/>
                            Solution moves: <span className="font-medium">{newPuzzle.solution.join(' → ') || 'None'}</span>
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <Label>Hint</Label>
                        <Input
                          value={newPuzzle.hint}
                          onChange={(e) => setNewPuzzle({ ...newPuzzle, hint: e.target.value })}
                          placeholder="e.g., Look at the weak f7 square"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Difficulty</Label>
                          <Select value={newPuzzle.difficulty} onValueChange={(value: 'easy' | 'medium' | 'hard') => setNewPuzzle({ ...newPuzzle, difficulty: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="easy">Easy</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="hard">Hard</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Icon</Label>
                          <Select value={newPuzzle.icon} onValueChange={(value) => setNewPuzzle({ ...newPuzzle, icon: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="♔">♔ King</SelectItem>
                              <SelectItem value="♕">♕ Queen</SelectItem>
                              <SelectItem value="♖">♖ Rook</SelectItem>
                              <SelectItem value="♗">♗ Bishop</SelectItem>
                              <SelectItem value="♘">♘ Knight</SelectItem>
                              <SelectItem value="♙">♙ Pawn</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button onClick={handleAddPuzzle} className="w-full" disabled={!newPuzzle.fen}>
                        <Save className="w-4 h-4 mr-2" /> Add Puzzle
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {puzzles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No puzzles yet. Add your first puzzle!
                  </div>
                ) : (
                  puzzles.map((puzzle) => (
                    <div key={puzzle._id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{puzzle.icon}</span>
                        <div>
                          <p className="font-medium text-foreground">{puzzle.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {puzzle.category} • {puzzle.difficulty}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={puzzle.isEnabled}
                            onCheckedChange={() => handleTogglePuzzle(puzzle._id!, puzzle.isEnabled)}
                          />
                          <span className={`text-sm ${puzzle.isEnabled ? 'text-success' : 'text-muted-foreground'}`}>
                            {puzzle.isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => handleDeletePuzzle(puzzle._id!)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Openings Tab */}
          <TabsContent value="openings">
            <div className="card-premium p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-xl font-semibold">Opening Management</h2>
                <Dialog open={showAddOpening} onOpenChange={setShowAddOpening}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add Opening
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Opening</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <VisualBoardEditor
                        onPositionSave={(fen, solution) => {
                          setNewOpening({ 
                            ...newOpening, 
                            moves: solution.map((move) => ({ 
                              san: move, 
                              comment: '', 
                              evaluation: '' 
                            })) 
                          });
                        }}
                      />
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="space-y-2">
                          <Label>Name *</Label>
                          <Input
                            value={newOpening.name}
                            onChange={(e) => setNewOpening({ ...newOpening, name: e.target.value })}
                            placeholder="e.g., Italian Game"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Category *</Label>
                          <Select value={newOpening.category} onValueChange={(value) => setNewOpening({ ...newOpening, category: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Open Games">Open Games</SelectItem>
                              <SelectItem value="Semi-Open Games">Semi-Open Games</SelectItem>
                              <SelectItem value="Closed Games">Closed Games</SelectItem>
                              <SelectItem value="Indian Defenses">Indian Defenses</SelectItem>
                              <SelectItem value="Flank Openings">Flank Openings</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2 space-y-2">
                          <Label>Description</Label>
                          <Textarea
                            value={newOpening.description}
                            onChange={(e) => setNewOpening({ ...newOpening, description: e.target.value })}
                            placeholder="Describe the opening"
                          />
                        </div>
                      </div>
                      <Button onClick={handleAddOpening} className="w-full">
                        <Save className="w-4 h-4 mr-2" /> Add Opening
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {openings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No openings yet. Add your first opening!
                  </div>
                ) : (
                  openings.map((opening) => (
                    <div key={opening._id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <BookOpen className="w-6 h-6 text-primary" />
                        <div>
                          <p className="font-medium text-foreground">{opening.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {opening.category} • {opening.moves?.length || 0} moves
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={opening.isEnabled}
                            onCheckedChange={() => handleToggleOpening(opening._id!, opening.isEnabled)}
                          />
                          <span className={`text-sm ${opening.isEnabled ? 'text-success' : 'text-muted-foreground'}`}>
                            {opening.isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteOpening(opening._id!)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Best Games Tab */}
          <TabsContent value="bestgames">
            <div className="card-premium p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-xl font-semibold">Best Games Management</h2>
                <Dialog open={showAddBestGame} onOpenChange={setShowAddBestGame}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add Best Game
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Best Game</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <VisualBoardEditor
                        onPositionSave={(fen, solution) => {
                          setNewBestGame({ 
                            ...newBestGame, 
                            moves: solution
                          });
                        }}
                      />
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="space-y-2">
                          <Label>Title *</Label>
                          <Input
                            value={newBestGame.title}
                            onChange={(e) => setNewBestGame({ ...newBestGame, title: e.target.value })}
                            placeholder="e.g., The Immortal Game"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Players *</Label>
                          <Input
                            value={newBestGame.players}
                            onChange={(e) => setNewBestGame({ ...newBestGame, players: e.target.value })}
                            placeholder="e.g., Anderssen vs Kieseritzky, 1851"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Category</Label>
                          <Select value={newBestGame.category} onValueChange={(value: 'brilliant' | 'best' | 'blunder') => setNewBestGame({ ...newBestGame, category: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="brilliant">Brilliant</SelectItem>
                              <SelectItem value="best">Best</SelectItem>
                              <SelectItem value="blunder">Blunder</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Highlight Moves (comma-separated move indices)</Label>
                          <Input
                            value={newBestGame.highlights.join(', ')}
                            onChange={(e) => setNewBestGame({ ...newBestGame, highlights: e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) })}
                            placeholder="e.g., 2, 4, 6"
                          />
                        </div>
                        <div className="col-span-2 space-y-2">
                          <Label>Description</Label>
                          <Textarea
                            value={newBestGame.description}
                            onChange={(e) => setNewBestGame({ ...newBestGame, description: e.target.value })}
                            placeholder="Describe the game"
                          />
                        </div>
                      </div>
                      <Button onClick={handleAddBestGame} className="w-full">
                        <Save className="w-4 h-4 mr-2" /> Add Best Game
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {bestGames.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No best games yet. Add your first best game!
                  </div>
                ) : (
                  bestGames.map((game) => (
                    <div key={game._id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <Trophy className={`w-6 h-6 ${
                          game.category === 'brilliant' ? 'text-brilliant' :
                          game.category === 'best' ? 'text-success' : 'text-warning'
                        }`} />
                        <div>
                          <p className="font-medium text-foreground">{game.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {game.players} • {game.moves?.length || 0} moves
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={game.isEnabled}
                            onCheckedChange={() => handleToggleBestGame(game._id!, game.isEnabled)}
                          />
                          <span className={`text-sm ${game.isEnabled ? 'text-success' : 'text-muted-foreground'}`}>
                            {game.isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteBestGame(game._id!)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminDashboard;
