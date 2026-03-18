import { createSlice } from '@reduxjs/toolkit';

export interface Project {
  id: string;
  appName: string;
  repoUrl: string;
  branch: string;
  framework: string;
  status: string; // BUILDING, DEPLOYED, FAILED
  url: string;
  appPort: number;
}

interface ProjectState {
  items: Project[];
  loading: boolean;
  error: string | null;
}

const initialState: ProjectState = {
  items: [],
  loading: false,
  error: null,
};

const projectSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    fetchProjectsStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchProjectsSuccess(state, action) {
      state.items = action.payload;
      state.loading = false;
    },
    fetchProjectsFailure(state, action) {
      state.loading = false;
      state.error = action.payload;
    },
    addProject(state, action) {
      state.items.push(action.payload);
    }
  },
});

export const { fetchProjectsStart, fetchProjectsSuccess, fetchProjectsFailure, addProject } = projectSlice.actions;
export default projectSlice.reducer;
