import type {
  DirectorResponse,
  InheritanceChannel,
  VisualSummary,
} from '../../shared/directorSchemas';

export type CanvasMode = 'inspect' | 'inherit' | 'combine' | 'create' | 'animate' | 'export';
export type CanvasObjectKind = 'reference' | 'upload' | 'created' | 'contract' | 'beat';
export type CanvasObjectSource = 'UPLOAD' | 'CREATED' | 'CONTRACT' | 'STORY';

export type CanvasObject = {
  id: string;
  assetId?: string;
  title: string;
  subtitle: string;
  kind: CanvasObjectKind;
  source: CanvasObjectSource;
  imageUrl?: string;
  previewUrl?: string;
  position: { x: number; y: number };
  inherit: InheritanceChannel[];
  locks: string[];
  summary: VisualSummary;
};

export type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  label?: string;
  error?: boolean;
  response?: DirectorResponse;
};

export const EMPTY_SUMMARY: VisualSummary = {
  emotion: [],
  materials: [],
  composition: [],
  palette: [],
  lighting: [],
  camera: [],
  world: [],
  style: [],
  subjects: [],
};

export const INHERITANCE_LABELS: Record<InheritanceChannel, string> = {
  emotion: 'Emotion',
  material: 'Material',
  world: 'World',
  framing: 'Framing',
  palette: 'Palette',
  identity: 'Identity',
  silhouette: 'Silhouette',
  lighting: 'Lighting',
};
