import { create } from 'zustand';

interface VisitState {
  activeVisitId: string | null; // Guarda o ID da loja se o promotor fez check-in
  startVisit: (id: string) => void;
  finishVisit: () => void;
}

export const useVisitStore = create<VisitState>((set) => ({
  activeVisitId: null, // Começa nulo (sem check-in)
  
  startVisit: (id) => set({ activeVisitId: id }),
  
  finishVisit: () => set({ activeVisitId: null }),
}));