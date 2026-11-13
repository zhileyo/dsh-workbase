import { z } from 'zod';

export const ansiKeys = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;
export const colorKeys = ['background', 'foreground', 'cursor', 'selectionBackground', ...ansiKeys] as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const terminalColorsSchema = z.object(Object.fromEntries(colorKeys.map(key => [key, color])) as Record<typeof colorKeys[number], typeof color>).strict();
export type TerminalColors = z.infer<typeof terminalColorsSchema>;
export const flavours = ['latte', 'frappe', 'macchiato', 'mocha'] as const;
export const catppuccinSchema = z.object({
  latte: terminalColorsSchema, frappe: terminalColorsSchema, macchiato: terminalColorsSchema, mocha: terminalColorsSchema,
}).strict();
export const defaultTerminalColors = (): TerminalColors => ({
  background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#45475a',
  black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af', blue: '#89b4fa',
  magenta: '#cba6f7', cyan: '#94e2d5', white: '#bac2de', brightBlack: '#585b70',
  brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af', brightBlue: '#89b4fa',
  brightMagenta: '#cba6f7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
});
export const terminalPaletteSchema = z.object({
  mode: z.enum(['follow', 'custom', ...flavours]),
  custom: terminalColorsSchema,
  catppuccin: catppuccinSchema.optional(),
  sourceRevision: z.string().regex(/^[0-9a-f]{40}$/).optional(),
}).strict();
export type TerminalPalette = z.infer<typeof terminalPaletteSchema>;
export const defaultTerminalPalette = (): TerminalPalette => ({ mode: 'follow', custom: defaultTerminalColors() });
export const resolveTerminalColors = (value: TerminalPalette): TerminalColors | undefined =>
  value.mode === 'follow' ? undefined : value.mode === 'custom' ? value.custom : value.catppuccin?.[value.mode];
export const CATPPUCCIN_REVISION = '07d02aa110ef9eb7e7427afca5c73ba9cf7f8ebd';
