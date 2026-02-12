// This is a temporary file to hold the correct App.tsx section
// I'll use this to fix the duplicate updateGroup issue

const correctedSection = `
  useEffect(() => {
      return () => {
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
      }
  }, []);

  const updateGroup = useCallback((group: 'primary' | 'secondary', updates: Partial<TextGroupConfig>, commitTo3D: boolean = false) => {
    handleUpdateConfig({
      layers: config.layers.map((layer, idx) => {
        if (idx === config.activeLayerIndex || config.syncAllLayers) {
            return { ...layer, [group]: { ...layer[group], ...updates } };
        }
        return layer;
      })
    }, commitTo3D);
  }, [config.layers, config.activeLayerIndex, config.syncAllLayers, handleUpdateConfig]);

  const updateCharOffset = useCallback((group: 'primary' | 'secondary', charIndex: number, offset: Partial<CharOffset>, commitTo3D: boolean = false) => {
    handleUpdateConfig({
      layers: config.layers.map((layer, idx) => {
        if (idx === config.activeLayerIndex || config.syncAllLayers) {
            const newOffsets = [...layer[group].charOffsets];
            if (!newOffsets[charIndex]) newOffsets[charIndex] = { x: 0, y: 0 };
            newOffsets[charIndex] = { ...newOffsets[charIndex], ...offset };
            return { ...layer, [group]: { ...layer[group], charOffsets: newOffsets } };
        }
        return layer;
      })
    }, commitTo3D);
  }, [config.layers, config.activeLayerIndex, config.syncAllLayers, handleUpdateConfig]);
`;

console.log('Corrected section prepared');
