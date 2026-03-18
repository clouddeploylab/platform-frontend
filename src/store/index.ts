import { configureStore } from '@reduxjs/toolkit';
import repoReducer from './repoSlice';
import projectReducer from './projectSlice';

export const store = configureStore({
  reducer: {
    repos: repoReducer,
    projects: projectReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
