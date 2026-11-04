// Every .json under /Examples (including subfolders) becomes an example preset.
// Vite resolves the glob at build time and picks up new files/folders in dev.
const exampleFiles = import.meta.glob('/Examples/**/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface ExampleEntry {
  id: string;
  label: string;
  group: string | null;
  text: string;
}

export const EXAMPLE_ENTRIES: ExampleEntry[] = Object.entries(exampleFiles)
  .map(([path, text]) => {
    const parts = path.replace(/^\/Examples\//, '').split('/');
    const file = parts.pop() || path;
    return {
      id: path,
      label: file.replace(/\.json$/i, '').replace(/[_-]+/g, ' '),
      group: parts.length > 0 ? parts.join(' / ') : null,
      text,
    };
  })
  .sort((a, b) =>
    (a.group ?? '').localeCompare(b.group ?? '') || a.label.localeCompare(b.label, undefined, { numeric: true })
  );
