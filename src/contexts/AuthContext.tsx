import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// API Base URL - uses environment variable or defaults to localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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
  role: 'admin' | 'student';
  isEnabled: boolean;
  onboardingComplete: boolean;
  joiningDate?: string;
  attendance?: AttendanceRecord[];
  achievements?: Achievement[];
  profile?: StudentProfile;
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
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  completeOnboarding: (profile: StudentProfile) => Promise<void>;
  isLoading: boolean;
  token: string | null;
  register: (username: string, password: string, role?: 'admin' | 'student') => Promise<boolean>;
  getAllUsers: () => Promise<User[]>;
  updateUser: (id: string, data: Partial<User & { password?: string }>) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored session
    const storedToken = localStorage.getItem('chessCoach_token');
    const storedUser = localStorage.getItem('chessCoach_user');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      
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
        setUser(userData);
        localStorage.setItem('chessCoach_user', JSON.stringify(userData));
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

  const login = async (username: string, password: string): Promise<boolean> => {
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
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('chessCoach_token', data.token);
        localStorage.setItem('chessCoach_user', JSON.stringify(data.user));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (username: string, password: string, role: 'admin' | 'student' = 'student'): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
        setUser(data.user);
        localStorage.setItem('chessCoach_user', JSON.stringify(data.user));
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
          setUser(updatedUser);
          localStorage.setItem('chessCoach_user', JSON.stringify(updatedUser));
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
