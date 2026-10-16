import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BASE_URL } from './http';

export type CatalogRole = { id: string; name: string; slug: string; colour: string };
export type CatalogType = { id: string; name: string; slug: string; colour: string; template: string | null };

type Catalog = { roles: CatalogRole[]; types: CatalogType[] };

const CatalogContext = createContext<Catalog>({ roles: [], types: [] });

export function WorkspaceCatalogProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['workspace-catalog'],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/workspace`, { credentials: 'include' });
      if (!res.ok) return { roles: [], types: [] } as Catalog;
      const json = await res.json() as Partial<Catalog>;
      return { roles: json.roles ?? [], types: json.types ?? [] };
    },
    staleTime: 60_000,
  });
  return (
    <CatalogContext.Provider value={query.data ?? { roles: [], types: [] }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useWorkspaceCatalog() {
  return useContext(CatalogContext);
}
