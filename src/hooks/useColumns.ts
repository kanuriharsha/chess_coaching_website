import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export interface DynamicColumn {
  _id: string;
  title: string;
  icon: string;
  adminId: string;
  order: number;
  isEnabled: boolean;
  contentType: 'opening' | 'bestGame' | 'famousMate' | 'generic';
}

export const columnsQueryKey = (token?: string | null) => ['columns', token] as const;
export const columnContentsQueryKey = (token?: string | null, columnId?: string) =>
  ['column-contents', token, columnId] as const;

export function useColumns(token?: string | null) {
  return useQuery({
    queryKey: columnsQueryKey(token),
    enabled: Boolean(token),
    staleTime: 60_000,
    queryFn: async (): Promise<DynamicColumn[]> => {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/columns`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(`Failed to load columns (HTTP ${response.status})`);
      }
      return response.json();
    }
  });
}

export interface ColumnContent {
  _id: string;
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  players?: string;
  moves?: unknown[];
  isEnabled?: boolean;
}

export function columnContentsQueryOptions(
  token: string | null | undefined,
  columnId: string
): UseQueryOptions<ColumnContent[]> {
  return {
    queryKey: columnContentsQueryKey(token, columnId),
    enabled: Boolean(token && columnId),
    staleTime: 60_000,
    queryFn: async (): Promise<ColumnContent[]> => {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/columns/${columnId}/contents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(`Failed to load column contents (HTTP ${response.status})`);
      }
      return response.json();
    }
  };
}
