import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTheme } from 'next-themes';

// API Base URL - uses environment variable or defaults to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL;

export interface AttendanceRecord {
  date: string;
  status: 'present' | 'absent';
  note?: string;
}

export interface Achievement {
  title: string;
  description: string;
  date: string;
  icon: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  role: 'admin' | 'superadmin' | 'student';
  verificationStatus?: 'under_review' | 'verified' | 'rejected';
  adminId?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  isEnabled: boolean;
  onboardingComplete: boolean;
  theme?: 0 | 1;
  joiningDate?: string;
  attendance?: AttendanceRecord[];
  achievements?: Achievement[];
  profile?: StudentProfile;
  commonNote?: string;
}

export interface StudentProfile {
  fullName: string;
  classDesignation: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  fatherName: string;
  motherName: string;
  email: string;
  village: string;
  state: string;
  country: string;
  schoolName?: string;
  chessTitle?: string;
  fideId?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string; verificationStatus?: string; username?: string }>;
  logout: () => void;
  completeOnboarding: (profile: StudentProfile) => Promise<void>;
  isLoading: boolean;
  token: string | null;
  register: (username: string, password: string, role?: 'student') => Promise<boolean>;
  getAllUsers: () => Promise<User[]>;
  updateUser: (id: string, data: Partial<User & { password?: string }>) => Promise<boolean>;
  updateTheme: (theme: 0 | 1) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored session
    const storedToken = localStorage.getItem('chessCoach_token');
    const storedUser = localStorage.getItem('chessCoach_user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      const cachedUser: User = JSON.parse(storedUser);
      cachedUser.theme = cachedUser.theme === 0 ? 0 : 1;
      setUser(cachedUser);
      setTheme(cachedUser.theme === 0 ? 'dark' : 'light');
      
      // Verify token is still valid
      verifyToken(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const verifyToken = async (authToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        const freshUser: User = { ...userData, theme: userData.theme === 0 ? 0 : 1 };
        setUser(freshUser);
        setTheme(freshUser.theme === 0 ? 'dark' : 'light');
        localStorage.setItem('chessCoach_user', JSON.stringify(freshUser));
      } else {
        // Token invalid, clear storage
        logout();
      }
    } catch (error) {
      console.error('Token verification error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string; verificationStatus?: string; username?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        const signedInUser: User = { ...data.user, theme: data.user.theme === 0 ? 0 : 1 };
        setUser(signedInUser);
        setTheme(signedInUser.theme === 0 ? 'dark' : 'light');
        setToken(data.token);
        localStorage.setItem('chessCoach_token', data.token);
        localStorage.setItem('chessCoach_user', JSON.stringify(signedInUser));
        return { success: true };
      }

      // Try to extract error message and verification status from server
      let serverMsg = undefined;
      let verificationStatus = undefined;
      let returnedUsername = undefined;
      try {
        const body = await response.json();
        serverMsg = body?.message;
        verificationStatus = body?.verificationStatus;
        returnedUsername = body?.username;
      } catch (e) {
        try {
          serverMsg = await response.text();
        } catch (e2) {
          serverMsg = undefined;
        }
      }

      return { 
        success: false, 
        message: serverMsg || 'Invalid credentials or account disabled',
        verificationStatus,
        username: returnedUsername
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Network or server error' };
    }
  };

  const register = async (username: string, password: string, role: 'student' = 'student'): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, password, role })
      });

      return response.ok;
    } catch (error) {
      console.error('Register error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setTheme('light');
    localStorage.removeItem('chessCoach_token');
    localStorage.removeItem('chessCoach_user');
  };

  const completeOnboarding = async (profile: StudentProfile): Promise<void> => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/onboarding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ profile })
      });

      if (response.ok) {
        const data = await response.json();
        const updatedUser: User = { ...data.user, theme: data.user.theme === 0 ? 0 : 1 };
        setUser(updatedUser);
        setTheme(updatedUser.theme === 0 ? 'dark' : 'light');
        localStorage.setItem('chessCoach_user', JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error('Onboarding error:', error);
    }
  };

  const getAllUsers = async (): Promise<User[]> => {
    if (!token) return [];

    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error('Get users error:', error);
      return [];
    }
  };

  const updateUser = async (id: string, data: Partial<User & { password?: string }>): Promise<boolean> => {
    if (!token) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) return false;

      try {
        const body = await response.json();
        // If the updated user is the currently authenticated user, refresh local user state
        const updatedUser = body?.user;
        if (updatedUser && user && updatedUser.id === user.id) {
          const currentUser = { ...user, ...updatedUser, theme: updatedUser.theme === 0 ? 0 : user.theme ?? 1 };
          setUser(currentUser);
          localStorage.setItem('chessCoach_user', JSON.stringify(currentUser));
        }
      } catch (err) {
        // ignore parse errors, still return ok
      }

      return true;
    } catch (error) {
      console.error('Update user error:', error);
      return false;
    }
  };

  const updateTheme = async (theme: 0 | 1): Promise<boolean> => {
    if (!token || !user) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/theme`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ theme })
      });
      if (!response.ok) return false;

      const updatedUser = { ...user, theme };
      setUser(updatedUser);
      setTheme(theme === 0 ? 'dark' : 'light');
      localStorage.setItem('chessCoach_user', JSON.stringify(updatedUser));
      return true;
    } catch (error) {
      console.error('Theme update error:', error);
      return false;
    }
  };

  const deleteUser = async (id: string): Promise<boolean> => {
    if (!token) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Delete user error:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      completeOnboarding, 
      isLoading, 
      token,
      register,
      getAllUsers,
      updateUser,
      updateTheme,
      deleteUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
