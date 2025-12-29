import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { useAuth, AttendanceRecord, Achievement, User, StudentProfile } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { User as UserIcon, Mail, Phone, MapPin, GraduationCap, Calendar, Trophy, Target, CalendarDays, Check, XCircle, Activity, Clock, TrendingUp } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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
  type: 'puzzle_solved' | 'game_played' | 'opening_studied' | 'best_game_viewed' | 'login';
  description: string;
  timestamp: string;
  details?: any;
}

const Profile = () => {
  const { user, token } = useAuth();
  const params = useParams();
  const userIdParam = params.userId;

  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editProfile, setEditProfile] = useState<Partial<StudentProfile>>({} as Partial<StudentProfile>);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [puzzleProgress, setPuzzleProgress] = useState<PuzzleProgress[]>([]);
  const [recentActivity, setRecentActivity] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const displayUser = targetUser || user;
  const profile = displayUser?.profile;
  const isViewingAsAdmin = user?.role === 'admin' && userIdParam;

  useEffect(() => {
    const loadTarget = async () => {
      if (userIdParam && user?.role === 'admin') {
        try {
          const resp = await fetch(`${API_BASE_URL}/users/${userIdParam}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resp.ok) {
            const data = await resp.json();
            setTargetUser(data);
            setEditProfile(data.profile || {});
            setEditUsername(data.username || '');
            setEditEmail(data.email || '');
          }
        } catch (err) {
          console.error('Load target user error:', err);
        }
      } else {
        setTargetUser(user || null);
        setEditProfile(user?.profile || {});
        setEditUsername(user?.username || '');
        setEditEmail(user?.email || '');
      }
    };

    loadTarget();
  }, [user, userIdParam, token]);

  useEffect(() => {
    const targetId = userIdParam || user?.id;
    if (targetId) {
      loadAttendance();
      if (isViewingAsAdmin) {
        loadPuzzleProgress();
        loadRecentActivity();
      }
    }
  }, [userIdParam, user?.id, isViewingAsAdmin]);

  const loadAttendance = async () => {
    try {
      const targetId = userIdParam || user?.id;
      if (!targetId) return;
      const response = await fetch(`${API_BASE_URL}/users/${targetId}/attendance`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAttendance(data);
      }
    } catch (error) {
      console.error('Load attendance error:', error);
    }
  };

  const loadPuzzleProgress = async () => {
    try {
      const targetId = userIdParam || user?.id;
      if (!targetId) return;
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/users/${targetId}/puzzle-progress`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPuzzleProgress(data);
      }
    } catch (error) {
      console.error('Load puzzle progress error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentActivity = async () => {
    try {
      const targetId = userIdParam || user?.id;
      if (!targetId) return;
      const response = await fetch(`${API_BASE_URL}/users/${targetId}/activity`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data);
      }
    } catch (error) {
      console.error('Load activity error:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!displayUser) return;
    try {
      const updateData: any = { profile: editProfile };
      if (user?.role === 'admin') {
        updateData.username = editUsername;
        updateData.email = editEmail;
      }
      
      const resp = await fetch(`${API_BASE_URL}/users/${displayUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData)
      });
      if (resp.ok) {
        toast.success('Profile updated successfully');
        const updated = await resp.json();
        setTargetUser(updated);
        setIsEditing(false);
      } else {
        toast.error('Failed to update profile');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update profile');
    }
  };

  // Calculate attendance stats
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount = attendance.filter(a => a.status === 'absent').length;
  const attendancePercentage = attendance.length > 0 
    ? Math.round((presentCount / attendance.length) * 100) 
    : 0;

  // Calculate puzzle stats
  const totalPuzzlesCompleted = puzzleProgress.reduce((sum, cat) => sum + cat.solvedPuzzles, 0);
  const totalPuzzlesAvailable = puzzleProgress.reduce((sum, cat) => sum + cat.totalPuzzles, 0);
  const completionRate = totalPuzzlesAvailable > 0 
    ? Math.round((totalPuzzlesCompleted / totalPuzzlesAvailable) * 100) 
    : 0;

  const stats = [
    { label: 'Puzzles Solved', value: totalPuzzlesCompleted || 127, icon: Target },
    { label: 'Games Played', value: 45, icon: Trophy },
    { label: 'Attendance', value: `${attendancePercentage}%`, icon: CalendarDays },
  ];

  const achievements = displayUser?.achievements || [];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'puzzle_solved':
        return '🧩';
      case 'game_played':
        return '♟️';
      case 'opening_studied':
        return '📖';
      case 'best_game_viewed':
        return '🏆';
      case 'login':
        return '🔓';
      default:
        return '📌';
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
            Profile
          </h1>
          <p className="text-muted-foreground">
            {isViewingAsAdmin ? `Viewing ${displayUser?.username}'s profile` : 'Your personal information and achievements'}
          </p>
        </div>

        {user?.role === 'admin' && displayUser && (
          <div className="flex justify-end mb-4 gap-2">
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)}>
                Edit Profile
              </Button>
            ) : (
              <>
                <Button onClick={handleSaveProfile}>
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { 
                    setIsEditing(false); 
                    setEditProfile(displayUser.profile || {}); 
                    setEditUsername(displayUser.username || '');
                    setEditEmail(displayUser.email || '');
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-[300px,1fr] gap-6">
          {/* Left Column - Profile Card */}
          <div className="space-y-4">
            <div className="card-premium p-6 text-center">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <UserIcon className="w-12 h-12 text-primary" />
              </div>
              <h2 className="font-serif text-xl font-bold text-foreground">
                {profile?.fullName || displayUser?.username}
              </h2>
              <p className="text-sm text-muted-foreground capitalize mt-1">
                {displayUser?.role === 'admin' ? 'Coach / Admin' : 'Student'}
              </p>
              {profile?.classDesignation && (
                <p className="text-sm text-primary mt-2">{profile.classDesignation}</p>
              )}
            </div>

            {/* Quick Stats */}
            <div className="card-premium p-4">
              <h3 className="font-medium text-foreground mb-4">Quick Stats</h3>
              <div className="space-y-3">
                {stats.map((stat, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <stat.icon className="w-4 h-4 text-primary" />
                      <span className="text-sm text-muted-foreground">{stat.label}</span>
                    </div>
                    <span className="font-semibold text-foreground">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Overview - Admin Only */}
            {isViewingAsAdmin && (
              <div className="card-premium p-4">
                <h3 className="font-medium text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Performance
                </h3>
                <div className="space-y-3">
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
            )}
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            {/* Personal Information */}
            <div className="card-premium p-6">
              <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
                Personal Information
              </h3>
              
              {isEditing ? (
                <div className="space-y-4">
                  {/* Account Information */}
                  <div className="pb-4 border-b border-border">
                    <h4 className="text-sm font-medium text-foreground mb-3">Account</h4>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          value={editUsername}
                          onChange={(e) => setEditUsername(e.target.value)}
                          placeholder="Username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="email@example.com"
                        />
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
                          value={editProfile.fullName || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, fullName: e.target.value })}
                          placeholder="Full name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dateOfBirth">Date of Birth</Label>
                        <Input
                          id="dateOfBirth"
                          type="date"
                          value={editProfile.dateOfBirth || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, dateOfBirth: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          value={editProfile.phone || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, phone: e.target.value })}
                          placeholder="Phone number"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="profileEmail">Contact Email</Label>
                        <Input
                          id="profileEmail"
                          type="email"
                          value={editProfile.email || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, email: e.target.value })}
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
                          value={editProfile.classDesignation || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, classDesignation: e.target.value })}
                          placeholder="e.g., 10th Grade"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="school">School Name</Label>
                        <Input
                          id="school"
                          value={editProfile.schoolName || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, schoolName: e.target.value })}
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
                          value={editProfile.village || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, village: e.target.value })}
                          placeholder="Village or City"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={editProfile.state || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, state: e.target.value })}
                          placeholder="State"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={editProfile.country || ''}
                          onChange={(e) => setEditProfile({ ...editProfile, country: e.target.value })}
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

              {!profile && !isEditing && (
                <p className="text-muted-foreground text-center py-8">
                  Complete your profile to see your information here.
                </p>
              )}
            </div>

            {/* Puzzle Progress - Admin Only */}
            {isViewingAsAdmin && (
              <div className="card-premium p-6">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  Puzzle Progress by Category
                </h3>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </div>
                ) : puzzleProgress.length > 0 ? (
                  <div className="space-y-4">
                    {puzzleProgress.map((category, idx) => (
                      <div key={idx} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-foreground">{category.category}</h4>
                          <span className="text-sm text-muted-foreground">
                            {category.solvedPuzzles} / {category.totalPuzzles} completed
                          </span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2 mb-3">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all" 
                            style={{ width: `${(category.solvedPuzzles / category.totalPuzzles) * 100}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {category.puzzleDetails.slice(0, 6).map((puzzle, pidx) => (
                            <div 
                              key={pidx}
                              className={`text-xs p-2 rounded flex items-center gap-2 ${
                                puzzle.solved 
                                  ? 'bg-success/10 text-success' 
                                  : 'bg-secondary/50 text-muted-foreground'
                              }`}
                            >
                              {puzzle.solved ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              <span className="truncate">Puzzle {pidx + 1}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No puzzle progress data available yet.
                  </p>
                )}
              </div>
            )}

            {/* Recent Activity - Admin Only */}
            {isViewingAsAdmin && (
              <div className="card-premium p-6">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Recent Activity
                </h3>
                {recentActivity.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {recentActivity.map((activity, idx) => (
                      <div 
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <span className="text-xl flex-shrink-0">{getActivityIcon(activity.type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{activity.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">
                              {new Date(activity.timestamp).toLocaleString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No recent activity to display.
                  </p>
                )}
              </div>
            )}

            {/* Achievements */}
            <div className="card-premium p-6">
              <h3 className="font-serif text-lg font-semibold text-foreground mb-4">
                Achievements
              </h3>
              {achievements.length > 0 ? (
                <div className="space-y-3">
                  {achievements.map((achievement, index) => (
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
                  No achievements yet. Keep learning and practicing!
                </p>
              )}
            </div>

            {/* Attendance */}
            {displayUser?.role === 'student' && (
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
                      {displayUser?.joiningDate 
                        ? new Date(displayUser.joiningDate as string).toLocaleDateString('en-IN', { 
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
                <h4 className="font-medium text-foreground mb-3">Recent Attendance</h4>
                {attendance.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {[...attendance].reverse().slice(0, 10).map((record, index) => (
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
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Profile;

