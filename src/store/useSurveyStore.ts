import { create } from 'zustand';

interface SurveyState {
  answers: Record<string, any>;
  photos: Record<string, string[]>; // Lista de URIs (file://...)
  setAnswer: (key: string, value: any) => void;
  addPhoto: (key: string, uri: string) => void;
  removePhoto: (key: string, index: number) => void;
  resetSurvey: () => void;
}

export const useSurveyStore = create<SurveyState>((set) => ({
  answers: {},
  photos: {},

  setAnswer: (key, value) => 
    set((state) => ({
      answers: { ...state.answers, [key]: value }
    })),

  addPhoto: (key, uri) =>
    set((state) => ({
      photos: {
        ...state.photos,
        [key]: [...(state.photos[key] || []), uri]
      }
    })),

  removePhoto: (key, index) =>
    set((state) => {
      const updated = (state.photos[key] || []).filter((_, i) => i !== index);
      return {
        photos: { ...state.photos, [key]: updated.length > 0 ? updated : [] }
      };
    }),

  resetSurvey: () => set({ answers: {}, photos: {} }),
}));