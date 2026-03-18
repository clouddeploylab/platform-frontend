import { createSlice } from '@reduxjs/toolkit';

export interface Repo {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description: string;
}

interface RepoState {
  items: Repo[];
  loading: boolean;
  error: string | null;
}

const initialState: RepoState = {
  items: [],
  loading: false,
  error: null,
};

const repoSlice = createSlice({
  name: 'repos',
  initialState,
  reducers: {
    fetchReposStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchReposSuccess(state, action) {
      state.items = action.payload;
      state.loading = false;
    },
    fetchReposFailure(state, action) {
      state.loading = false;
      state.error = action.payload;
    },
  },
});

export const { fetchReposStart, fetchReposSuccess, fetchReposFailure } = repoSlice.actions;
export default repoSlice.reducer;
