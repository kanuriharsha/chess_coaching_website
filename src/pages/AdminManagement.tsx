import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Users, 
  Clock, 
  UserCheck, 
  Plus, 
  Trash2, 
  Edit, 
  Check, 
  X, 
  Save, 
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface ManagedAdmin {
  id: string;
  username: string;
  role: 'admin';
  isEnabled: boolean;
  verificationStatus?: 'under_review' | 'verified' | 'rejected';
  adminId?: string | null;
  adminName?: string | null;
  profile?: {
    fullName?: string;
    email?: string;
    phone?: string;
    gender?: string;
    dateOfBirth?: string;
    chessTitle?: string;
    fideId?: string;
    village?: string;
    state?: string;
    country?: string;
  };
  createdAt?: string;
}

export default function AdminManagement() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'admins' | 'requests'>('admins');
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [adminRequests, setAdminRequests] = useState<ManagedAdmin[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Direct Admin Dialog states
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<ManagedAdmin | null>(null);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEnabled, setAdminEnabled] = useState(true);

  // Superadmin guard
  if (!user || user.role !== 'superadmin') {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    loadAdmins();
    loadAdminRequests();
  }, [token]);

  const loadAdmins = async () => {
    setIsLoadingAdmins(true);
    try {
      const response = await fetch(`${API_BASE_URL}/superadmin/admins`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load admin accounts');
      setAdmins(await response.json());
    } catch (error) {
      console.error('Load admins error:', error);
      toast.error('Failed to load admin accounts');
    } finally {
      setIsLoadingAdmins(false);
    }
  };

  const loadAdminRequests = async () => {
    setIsLoadingRequests(true);
    try {
      const response = await fetch(`${API_BASE_URL}/superadmin/admin-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load admin requests');
      setAdminRequests(await response.json());
    } catch (error) {
      console.error('Load admin requests error:', error);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const handleAdminRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    setActionLoadingId(requestId);
    try {
      const response = await fetch(`${API_BASE_URL}/superadmin/admin-requests/${requestId}/action`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || `Failed to ${action} request`);
      }

      toast.success(action === 'approve' ? 'Admin request accepted and verified!' : 'Admin request rejected');
      await Promise.all([loadAdmins(), loadAdminRequests()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} request`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const openAdminDialog = (admin?: ManagedAdmin) => {
    setEditingAdmin(admin || null);
    setAdminUsername(admin?.username || '');
    setAdminPassword('');
    setAdminEnabled(admin?.isEnabled ?? true);
    setAdminDialogOpen(true);
  };

  const saveAdmin = async () => {
    if (!adminUsername.trim() || (!editingAdmin && !adminPassword.trim())) {
      toast.error('Username and password are required');
      return;
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/superadmin/admins${editingAdmin ? `/${editingAdmin.id}` : ''}`,
        {
          method: editingAdmin ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            username: adminUsername.trim(),
            ...(adminPassword.trim() ? { password: adminPassword.trim() } : {}),
            ...(editingAdmin ? { isEnabled: adminEnabled } : {})
          })
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save admin');
      }
      toast.success(editingAdmin ? 'Admin updated successfully' : 'Admin created successfully');
      setAdminDialogOpen(false);
      await loadAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save admin');
    }
  };

  const toggleAdminEnabled = async (admin: ManagedAdmin) => {
    try {
      const response = await fetch(`${API_BASE_URL}/superadmin/admins/${admin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isEnabled: !admin.isEnabled })
      });
      if (!response.ok) throw new Error('Failed to update admin');
      await loadAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update admin');
    }
  };

  const removeAdmin = async (admin: ManagedAdmin) => {
    if (!confirm(`Delete admin "${admin.username}"?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/superadmin/admins/${admin.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete admin');
      toast.success('Admin deleted');
      await loadAdmins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete admin');
    }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-6xl mx-auto py-2">
        {/* Top Horizontal Internal Tabs */}
        <div className="bg-card rounded-2xl border border-border shadow-sm mb-6 p-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Horizontal Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('admins')}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'admins'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Admins</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'admins'
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {admins.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'requests'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Admin Request</span>
                {adminRequests.length > 0 ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold animate-pulse ${
                      activeTab === 'requests'
                        ? 'bg-amber-400 text-amber-950'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {adminRequests.length}
                  </span>
                ) : (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      activeTab === 'requests'
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    0
                  </span>
                )}
              </button>
            </div>

            {/* Actions for current tab */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadAdmins();
                  loadAdminRequests();
                }}
                disabled={isLoadingAdmins || isLoadingRequests}
                className="h-9 px-3 gap-1.5"
                title="Refresh lists"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdmins || isLoadingRequests ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline text-xs">Refresh</span>
              </Button>

              {activeTab === 'admins' && (
                <Button size="sm" onClick={() => openAdminDialog()} className="h-9 gap-1.5 text-xs">
                  <Plus className="w-4 h-4" /> Add Admin Directly
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tab 1: Admins */}
        {activeTab === 'admins' && (
          <div className="card-premium p-4 md:p-6 animate-fade-in">
            {isLoadingAdmins ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : admins.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-14 h-14 text-muted-foreground mx-auto mb-3 opacity-30" />
                <h3 className="font-serif text-lg font-semibold text-foreground">No Verified Admins</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  There are no verified administrators yet. Approved applicants will appear here.
                </p>
                <Button onClick={() => openAdminDialog()} className="mt-4">
                  <Plus className="w-4 h-4 mr-1.5" /> Add First Admin
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="pb-3 font-semibold">Admin</th>
                      <th className="pb-3 font-semibold">Contact</th>
                      <th className="pb-3 font-semibold">Chess & Location</th>
                      <th className="pb-3 font-semibold">Accepted By</th>
                      <th className="pb-3 font-semibold">Date</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold">Access</th>
                      <th className="pb-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                              {admin.profile?.fullName?.charAt(0) || admin.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-foreground">
                                {admin.profile?.fullName || admin.username}
                              </p>
                              <p className="text-xs text-muted-foreground">@{admin.username}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5">
                          <div className="text-xs space-y-0.5">
                            {admin.profile?.email ? (
                              <p className="text-foreground flex items-center gap-1">
                                <Mail className="w-3 h-3 text-muted-foreground" />
                                {admin.profile.email}
                              </p>
                            ) : (
                              <p className="text-muted-foreground italic">No email</p>
                            )}
                            {admin.profile?.phone && (
                              <p className="text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3 text-muted-foreground" />
                                {admin.profile.phone}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5">
                          <div className="text-xs space-y-1">
                            {admin.profile?.chessTitle && (
                              <span className="inline-block px-2 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold">
                                {admin.profile.chessTitle}
                              </span>
                            )}
                            {admin.profile?.fideId && (
                              <span className="ml-1 text-[11px] text-muted-foreground font-mono">
                                FIDE: {admin.profile.fideId}
                              </span>
                            )}
                            {admin.profile?.village ? (
                              <p className="text-muted-foreground text-[11px] flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-muted-foreground" />
                                {admin.profile.village}, {admin.profile.state}
                              </p>
                            ) : (
                              <p className="text-muted-foreground italic text-[11px]">—</p>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5">
                          <div className="text-xs">
                            {admin.adminName ? (
                              <span className="font-medium text-foreground">{admin.adminName}</span>
                            ) : admin.adminId ? (
                              <span className="text-muted-foreground">Superadmin</span>
                            ) : (
                              <span className="text-muted-foreground italic">Direct</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 text-xs text-muted-foreground">
                          {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '—'}
                        </td>

                        <td className="py-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <Check className="w-3 h-3" /> Verified
                          </span>
                        </td>

                        <td className="py-3.5">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={admin.isEnabled}
                              onCheckedChange={() => toggleAdminEnabled(admin)}
                            />
                            <span className={`text-xs ${admin.isEnabled ? 'text-success' : 'text-muted-foreground'}`}>
                              {admin.isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAdminDialog(admin)}
                              className="h-8 w-8 p-0"
                              title="Edit admin"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAdmin(admin)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Delete admin"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Admin Request */}
        {activeTab === 'requests' && (
          <div className="card-premium p-4 md:p-6 animate-fade-in">
            {isLoadingRequests ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : adminRequests.length === 0 ? (
              <div className="text-center py-16">
                <Clock className="w-14 h-14 text-muted-foreground mx-auto mb-3 opacity-30" />
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  No Pending Admin Requests
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  When new coaches register through the Admin Onboarding page (/onboarding/admin), their verification requests will appear here for review.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {adminRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 transition-all shadow-sm"
                  >
                    {/* Request Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-bold text-amber-600 dark:text-amber-400 text-base">
                          {req.profile?.fullName?.charAt(0) || req.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-serif font-bold text-base md:text-lg text-foreground">
                              {req.profile?.fullName || req.username}
                            </h3>
                            <span className="px-2 py-0.5 rounded bg-secondary text-xs font-mono text-muted-foreground">
                              @{req.username}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Submitted:{' '}
                            {req.createdAt
                              ? new Date(req.createdAt).toLocaleString()
                              : 'Recently'}
                          </p>
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-semibold uppercase tracking-wider self-start sm:self-auto">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Under Review
                      </div>
                    </div>

                    {/* Request Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 text-xs md:text-sm">
                      {/* Personal Info */}
                      <div className="space-y-2 p-3.5 rounded-xl bg-card border border-border/60">
                        <p className="font-semibold text-primary text-xs uppercase tracking-wide">
                          1. Personal Information
                        </p>
                        <div className="space-y-1.5 text-muted-foreground">
                          <p className="flex justify-between">
                            <span>Email:</span>
                            <span className="font-medium text-foreground">{req.profile?.email || '—'}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Phone:</span>
                            <span className="font-medium text-foreground">{req.profile?.phone || '—'}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Gender:</span>
                            <span className="font-medium text-foreground capitalize">{req.profile?.gender || '—'}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Date of Birth:</span>
                            <span className="font-medium text-foreground">{req.profile?.dateOfBirth || '—'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Chess & Location Info */}
                      <div className="space-y-2 p-3.5 rounded-xl bg-card border border-border/60">
                        <p className="font-semibold text-primary text-xs uppercase tracking-wide">
                          2. Chess & Location Information
                        </p>
                        <div className="space-y-1.5 text-muted-foreground">
                          <p className="flex justify-between">
                            <span>Chess Title:</span>
                            <span className="font-semibold text-foreground">
                              {req.profile?.chessTitle || 'None'}
                            </span>
                          </p>
                          <p className="flex justify-between">
                            <span>FIDE ID:</span>
                            <span className="font-mono text-foreground">{req.profile?.fideId || 'None'}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>Village / Town:</span>
                            <span className="font-medium text-foreground">{req.profile?.village || '—'}</span>
                          </p>
                          <p className="flex justify-between">
                            <span>State & Country:</span>
                            <span className="font-medium text-foreground">
                              {req.profile?.state}, {req.profile?.country}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-border/60">
                      <Button
                        variant="outline"
                        onClick={() => handleAdminRequestAction(req.id, 'reject')}
                        disabled={actionLoadingId === req.id}
                        className="w-full sm:w-auto text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive text-sm"
                      >
                        <X className="w-4 h-4 mr-1.5" />
                        {actionLoadingId === req.id ? 'Processing...' : 'Reject Request'}
                      </Button>

                      <Button
                        onClick={() => handleAdminRequestAction(req.id, 'approve')}
                        disabled={actionLoadingId === req.id}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm"
                      >
                        <Check className="w-4 h-4 mr-1.5" />
                        {actionLoadingId === req.id ? 'Accepting...' : 'Accept & Verify'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dialog for Creating or Editing Admin Directly */}
        <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-primary" />
                {editingAdmin ? 'Edit Admin' : 'Add New Admin Directly'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Username *</Label>
                <Input
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="Enter admin username"
                />
              </div>
              <div>
                <Label>{editingAdmin ? 'Password (leave blank to keep unchanged)' : 'Password *'}</Label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder={editingAdmin ? 'Enter new password if changing' : 'Enter password'}
                />
              </div>
              {editingAdmin && (
                <div className="flex items-center justify-between py-2">
                  <Label>Account Enabled</Label>
                  <Switch checked={adminEnabled} onCheckedChange={setAdminEnabled} />
                </div>
              )}
              <Button onClick={saveAdmin} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {editingAdmin ? 'Save Changes' : 'Create Admin'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
