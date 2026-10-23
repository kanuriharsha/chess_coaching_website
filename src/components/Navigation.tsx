import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import {
  Crown,
  Puzzle,
  Swords,
  BookOpen,
  Trophy,
  User,
  LogOut,
  Settings,
  Menu,
  X,
  LayoutDashboard,
  PlusCircle,
  Skull,
  Users,
  Star,
  Target,
  Lightbulb,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useColumns } from '@/hooks/useColumns';

const Navigation = () => {
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: columns = [], error: columnsError } = useColumns(token);

  useEffect(() => {
    if (columnsError) console.error('Load navigation columns error:', columnsError);
  }, [columnsError]);

  const iconForColumn = (name: string) => ({
    BookOpen,
    Trophy,
    Crown,
    Puzzle,
    Star,
    Target,
    Lightbulb,
    Swords
  }[name] || BookOpen);

  const navItems = [
    ...(isAdminRole(user?.role)
    ? [{ to: '/admin', icon: LayoutDashboard, label: 'Dashboard' }]
    : []),
    ...(!isAdminRole(user?.role)
    ? [{ to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }]
    : []),
    { to: '/puzzles', icon: Puzzle, label: 'Puzzles' },
    { to: '/practice', icon: Target, label: 'Practice with AI' },
    { to: '/games', icon: Swords, label: 'Games' },
    ...(user?.role === 'superadmin'
      ? [{ to: '/admin-management', icon: Users, label: 'Admin Management' }]
      : []),
  ];
  const bottomNavItems = [
    ...navItems.filter(item => item.label !== 'Admin Management'),
    { to: '/profile', icon: User, label: 'Profile' }
  ].slice(0, 4);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Desktop Navigation - Sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-sidebar flex-col border-r border-sidebar-border">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
              <Crown className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-bold text-sidebar-foreground">
                Chess Coach
              </h1>
              <p className="text-xs text-sidebar-foreground/60">Learn. Play. Master.</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                transition-all duration-200
                ${
                  isActive(item.to)
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }
              `}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
          {columns.map(column => {
            const Icon = iconForColumn(column.icon);
            return (
              <NavLink
                key={column._id}
                to={`/columns/${column._id}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive(`/columns/${column._id}`)
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate">{column.title}</span>
              </NavLink>
            );
          })}
          {user && (
            <NavLink
              to="/profile"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive('/profile')
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <User className="w-5 h-5" />
              Profile
            </NavLink>
          )}
          {isAdminRole(user?.role) && (
            <NavLink
              to="/columns/manage"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive('/columns/manage')
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <PlusCircle className="w-5 h-5" />
              Add Columns
            </NavLink>
          )}
        </div>

        {/* User Section */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <User className="w-5 h-5 text-sidebar-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.profile?.fullName || user?.username}
              </p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Mobile Navigation - Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
        <div className="flex justify-around items-center py-2 px-4">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`
                flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium
                transition-all duration-200
                ${
                  isActive(item.to)
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <item.icon className={`w-5 h-5 ${isActive(item.to) ? 'animate-scale-in' : ''}`} />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground"
          >
            <Menu className="w-5 h-5" />
            More
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-foreground/50 z-50" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-card shadow-xl animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-serif text-lg font-semibold">Menu</h2>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 space-y-1">
              {navItems.filter(item => item.label !== 'Admin Management').map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                    transition-all duration-200
                    ${
                      isActive(item.to)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              ))}
              {columns.map(column => {
                const Icon = iconForColumn(column.icon);
                return (
                  <NavLink
                    key={column._id}
                    to={`/columns/${column._id}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
                      isActive(`/columns/${column._id}`) ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {column.title}
                  </NavLink>
                );
              })}
              {user?.role === 'superadmin' && (
                <NavLink
                  to="/admin-management"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
                    isActive('/admin-management') ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  Admin Management
                </NavLink>
              )}
              {user && (
                <NavLink
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
                    isActive('/profile') ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'
                  }`}
                >
                  <User className="w-5 h-5" />
                  Profile
                </NavLink>
              )}
              {isAdminRole(user?.role) && (
                <NavLink
                  to="/columns/manage"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
                    isActive('/columns/manage') ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'
                  }`}
                >
                  <PlusCircle className="w-5 h-5" />
                  Add Columns
                </NavLink>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navigation;
