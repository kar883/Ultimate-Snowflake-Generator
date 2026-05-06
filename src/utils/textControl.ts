import opentype from 'opentype.js';

import { CharOffset } from '../types';

export interface TextControlEntry {
  label: string;
  storageIndex: number;
  charIndex: number;
  isDot: boolean;
}

// Characters with floating/detached accent marks that can be adjusted independently
const DOTTED_TEXT_CHARS = new Set([
  'i', 'j',
  // Lowercase with diacritics (umlauts/diaeresis)
  'ä', 'ë', 'ï', 'ö', 'ü',
  // Lowercase with acute/grave/circumflex/tilde
  'à', 'á', 'â', 'ã', 'å', 'è', 'é', 'ê', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ù', 'ú', 'û',
  // Uppercase with diacritics
  'Ä', 'Ë', 'Ï', 'Ö', 'Ü',
  // Uppercase with acute/grave/circumflex/tilde
  'À', 'Á', 'Â', 'Ã', 'Å', 'È', 'É', 'Ê', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ù', 'Ú', 'Û',
]);

const ZERO_OFFSET: CharOffset = { x: 0, y: 0 };

const cloneCommand = (command: opentype.PathCommand): opentype.PathCommand => ({ ...command });

const translateCommand = (command: opentype.PathCommand, dx: number, dy: number): opentype.PathCommand => {
  const next = cloneCommand(command);
  if ('x' in next && typeof next.x === 'number') next.x += dx;
  if ('y' in next && typeof next.y === 'number') next.y += dy;
  if ('x1' in next && typeof next.x1 === 'number') next.x1 += dx;
  if ('y1' in next && typeof next.y1 === 'number') next.y1 += dy;
  if ('x2' in next && typeof next.x2 === 'number') next.x2 += dx;
  if ('y2' in next && typeof next.y2 === 'number') next.y2 += dy;
  return next;
};

const splitCommandsIntoContours = (commands: opentype.PathCommand[]): opentype.PathCommand[][] => {
  const contours: opentype.PathCommand[][] = [];
  let current: opentype.PathCommand[] = [];

  commands.forEach((command) => {
    if (command.type === 'M' && current.length > 0) {
      contours.push(current);
      current = [];
    }
    current.push(command);
  });

  if (current.length > 0) {
    contours.push(current);
  }

  return contours;
};

export const getPathCommandBounds = (commands: opentype.PathCommand[]) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  commands.forEach((command) => {
    const points: Array<[number | undefined, number | undefined]> = [
      ['x' in command ? command.x : undefined, 'y' in command ? command.y : undefined],
      ['x1' in command ? command.x1 : undefined, 'y1' in command ? command.y1 : undefined],
      ['x2' in command ? command.x2 : undefined, 'y2' in command ? command.y2 : undefined],
    ];

    points.forEach(([x, y]) => {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};

const getDotContourIndexes = (char: string, commands: opentype.PathCommand[]): Set<number> => {
  if (!DOTTED_TEXT_CHARS.has(char)) return new Set<number>();

  const contours = splitCommandsIntoContours(commands);
  if (contours.length <= 1) return new Set<number>();

  const contourBounds = contours
    .map((contour, index) => ({ index, bounds: getPathCommandBounds(contour) }))
    .filter((entry): entry is { index: number; bounds: NonNullable<ReturnType<typeof getPathCommandBounds>> } => Boolean(entry.bounds));

  if (contourBounds.length <= 1) return new Set<number>();

  const globalMinY = Math.min(...contourBounds.map((entry) => entry.bounds.minY));
  const globalMaxY = Math.max(...contourBounds.map((entry) => entry.bounds.maxY));
  const glyphHeight = Math.max(globalMaxY - globalMinY, 1);
  const joinTolerance = glyphHeight * 0.02;
  const sortedContours = [...contourBounds].sort((left, right) => left.bounds.minY - right.bounds.minY);
  const contourClusters = sortedContours.reduce<Array<{ minY: number; maxY: number; indexes: number[] }>>((clusters, entry) => {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster || entry.bounds.minY > lastCluster.maxY + joinTolerance) {
      clusters.push({ minY: entry.bounds.minY, maxY: entry.bounds.maxY, indexes: [entry.index] });
      return clusters;
    }

    lastCluster.minY = Math.min(lastCluster.minY, entry.bounds.minY);
    lastCluster.maxY = Math.max(lastCluster.maxY, entry.bounds.maxY);
    lastCluster.indexes.push(entry.index);
    return clusters;
  }, []);

  if (contourClusters.length > 1) {
    return new Set<number>(contourClusters[0].indexes);
  }

  // Fallback: pick the contour with the smallest (most-negative) minY — i.e., the topmost dot
  const topmostContour = contourBounds.reduce((best, entry) => (
    entry.bounds.minY < best.bounds.minY ? entry : best
  ));
  return new Set<number>([topmostContour.index]);
};

export const buildTextControlEntries = (text: string): TextControlEntry[] => {
  const entries: TextControlEntry[] = [];
  let dotCount = 0;

  text.split('').forEach((char, charIndex) => {
    entries.push({
      label: char,
      storageIndex: charIndex,
      charIndex,
      isDot: false,
    });

    if (DOTTED_TEXT_CHARS.has(char)) {
      entries.push({
        label: 'dot',
        storageIndex: text.length + dotCount,
        charIndex,
        isDot: true,
      });
      dotCount += 1;
    }
  });

  return entries;
};

export const getDotStorageIndex = (text: string, charIndex: number): number | null => {
  if (!DOTTED_TEXT_CHARS.has(text[charIndex] ?? '')) return null;

  let dotCount = 0;
  for (let index = 0; index <= charIndex; index += 1) {
    if (DOTTED_TEXT_CHARS.has(text[index] ?? '')) {
      if (index === charIndex) {
        return text.length + dotCount;
      }
      dotCount += 1;
    }
  }

  return null;
};

export const getGlyphControlOffsets = (
  text: string,
  charOffsets: CharOffset[] | undefined,
  charIndex: number
) => {
  const offsets = Array.isArray(charOffsets) ? charOffsets : [];
  const dotStorageIndex = getDotStorageIndex(text, charIndex);

  return {
    baseOffset: offsets[charIndex] ?? ZERO_OFFSET,
    dotOffset: dotStorageIndex === null ? ZERO_OFFSET : (offsets[dotStorageIndex] ?? ZERO_OFFSET),
    dotStorageIndex,
  };
};

export const makePathFromCommands = (commands: opentype.PathCommand[]): opentype.Path => {
  const path = new opentype.Path();
  path.commands = commands.map(cloneCommand);
  return path;
};

export const getAdjustedGlyphPathCommands = (
  glyph: opentype.Glyph,
  text: string,
  charOffsets: CharOffset[] | undefined,
  charIndex: number,
  x: number,
  fontSize: number
): opentype.PathCommand[] => {
  const rawCommands = glyph.getPath(x, 0, fontSize).commands;
  const { baseOffset, dotOffset } = getGlyphControlOffsets(text, charOffsets, charIndex);
  const dotContourIndexes = getDotContourIndexes(text[charIndex] ?? '', rawCommands);
  const contours = splitCommandsIntoContours(rawCommands);

  return contours.flatMap((contour, contourIndex) => {
    const dx = baseOffset.x + (dotContourIndexes.has(contourIndex) ? dotOffset.x : 0);
    const dy = baseOffset.y + (dotContourIndexes.has(contourIndex) ? dotOffset.y : 0);
    return contour.map((command) => translateCommand(command, dx, dy));
  });
};