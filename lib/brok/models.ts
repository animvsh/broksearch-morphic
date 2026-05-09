export const BROK_MODELS = {
  'brok-lite': {
    name: 'Brok Lite',
    description: 'Fast, efficient model for simple tasks',
  },
  'brok-standard': {
    name: 'Brok Standard',
    description: 'Balanced model for general use',
  },
  'brok-reasoning': {
    name: 'Brok Reasoning',
    description: 'Enhanced reasoning and analysis',
  },
} as const;

export type BrokModelId = keyof typeof BROK_MODELS;
