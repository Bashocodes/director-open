export type WorkerEnv = Env & {
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

export type DirectorEnv = Partial<Pick<
  WorkerEnv,
  'GEMINI_API_KEY' | 'OPENAI_API_KEY' | 'DIRECTOR_DEMO_MODE'
>>;
