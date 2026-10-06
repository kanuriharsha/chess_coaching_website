import type { User } from '@/contexts/AuthContext';

export function isAdminRole(role: User['role'] | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}
