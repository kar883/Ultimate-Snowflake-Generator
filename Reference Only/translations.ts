// Translation system for the Ultimate Snowflake Generator
export interface Translations {
  // Tab labels
  global: string;
  text: string;
  'Letter Ctrl': string;
  hubs: string;
  abstract: string;
  planes: string;
  
  // Control labels
  'Project Name': string;
  'Model Color': string;
  'Edge Profile': string;
  'Extrusion Depth': string;
  'Global Boldness': string;
  'Preview Resolution': string;
  'Generating Model': string;
  'Grid On': string;
  'Grid Off': string;
  'Reference Radius': string;
  'AI Randomizer': string;
  'Shuffle / Refresh': string;
  'Reset on Shuffle': string;
  'Reset View': string;
  'Tooltips': string;
  'Language': string;
  'Cap Style': string;
  'Oscillation Enable': string;
  'Sync All Planes': string;
  'Bevel Amount': string;
  'Fillet Detail': string;
  'Mirror Offset': string;
  'Export Layer': string;
  '2D Formats': string;
  'SVG Vector': string;
  'DXF (CAD)': string;
  'Underline': string;
  'Underline Thickness': string;
  'Mirror Effect': string;
  'Radius Lock': string;
  'Radius Locked': string;
  'Radius Unlocked': string;
  'Inner Radius': string;
  'Outer Radius': string;
  'Diameter Mode': string;
  'Auto-fit': string;
  'Fixed Size': string;
  'Boldness': string;
  'Letter Spacing': string;
  'Manual Rotation': string;
  'Arms / Symmetry': string;
  'Font Size': string;
  'Font Search': string;
  'Browse System Fonts': string;
  'Requires Chrome/Edge': string;
  'System Fonts': string;
  'Upload Font': string;
  'Offset X': string;
  'Offset Y': string;
  'Phrase Content': string;
  'Primary': string;
  'Secondary': string;
  'Fillet': string;
  'Chamfer': string;
  'Active Plane Selector': string;
  'Rotation': string;
  'Amplitude': string;
  'Frequency': string;
  'Hub Sides': string;
  'Star Ratio': string;
  'Hollow': string;
  'Visible': string;
  'Hidden': string;
  'Wall Thickness': string;
  'Hub Shape': string;
  'Hub Properties': string;
  'Hub Radius': string;
  'None': string;
  'Export': string;
  'Shuffle': string;
  'Refresh': string;
  'Square': string;
  'Round': string;
  'Triangle': string;
  'Cap Length': string;
  'Underline Start': string;
  'Underline Length': string;
  'Underline Mirror Offset': string;
  'Slot Length Adj': string;
  'Slot Width Offset': string;
  'Slot Length': string;
  'Slot Width': string;
  'Random Seed': string;
  'Angle Variation': string;
  'Length Variation': string;
  'Thickness Decay': string;
  'Rounded Tips': string;
  'Cut Slots': string;
  'Export STL': string;
  'Export All Planes': string;
  'Combined STL': string;
  'Zip All STLs': string;
  'Auto-Configure Assembly Slots': string;
  'Export Resolution': string;
  'Abstract Outer Radius': string;
  'Rot X': string;
  'Rot Y': string;
  'Rot Z': string;
  'Leave blank for AI Randomizer to choose a word': string;
  'Search Fonts...': string;
  'Save My Project': string;
  'Save': string;
  'Load': string;
  'Add Shape': string;
  '+ Shape': string;
  'Shape': string;
  'Add Fractal': string;
  '+ Fractal': string;
  'Fractal': string;
  'Add Hub': string;
  '+ Hub': string;
  'Delete Hub': string;
  'Layer Name': string;
  'Tree Arms': string;
  'Shape Arms': string;
  'Branching Structure': string;
  'Trunk Length': string;
  'Branches Per Node': string;
  'Recursion Depth': string;
  'Min Branch Length': string;
  'Branch Pattern': string;
  'Branch Geometry': string;
  'Branch Angle': string;
  'Branch Length': string;
  'Initial Length': string;
  'Length Decay': string;
  'Shape Settings': string;
  'Fractal Settings': string;
  'symmetric': string;
  'alternating': string;
  'random': string;
  'line': string;
  'sine': string;
  'zigzag': string;
  'All Planes': string;
  'Selected Character': string;
  'circle': string;
  'polygon': string;
  'star': string;
  'Chevron': string;
  'Outer Diameter': string;
  'Visible_desc': string;
  'Hidden_desc': string;
  'Delete_desc': string;
  'Delete Hub_desc': string;
  'Reset View_desc': string;
  
  // Descriptions
  'Project Name_desc': string;
  'Model Color_desc': string;
  'Edge Profile_desc': string;
  'Extrusion Depth_desc': string;
  'Global Boldness_desc': string;
  'Preview Resolution_desc': string;
  'AI Randomizer_desc': string;
  'Shuffle / Refresh_desc': string;
  'Reset on Shuffle_desc': string;
  'Tooltips_desc': string;
  'Language_desc': string;
  
  // Quality levels
  low: string;
  med: string;
  high: string;
  
  // Common UI
  reset: string;
  cancel: string;
  save: string;
  settings: string;
  'Keyboard Shortcuts': string;
  'Reset Defaults': string;
  'Save Changes': string;
  'ON': string;
  'OFF': string;
  
  // Shortcut actions
  switchToGlobalTab: string;
  switchToTextTab: string;
  switchToLetterCtrlTab: string;
  switchToHubsTab: string;
  switchToAbstractTab: string;
  switchToPlanesTab: string;
  toggleView: string;
  forceRegenerate: string;
  exportCombinedSTL: string;
  exportBasePlaneSTL: string;
  exportCrossPlaneSTL: string;
  exportTiltPlaneSTL: string;
  saveProject: string;
  loadProject: string;
  undo: string;
  redo: string;
  
  // Languages
  'English': string;
  'Español': string;
  'Français': string;
  'Deutsch': string;
  '中文': string;
  '日本語': string;
  
  // Layer names
  'Base Plane': string;
  'Cross Plane': string;
  'Tilt Plane': string;
}

export const translations: Record<string, Translations> = {
  en: {
    // Tab labels
    global: 'Global',
    text: 'Text',
    'Letter Ctrl': 'Letter Ctrl',
    hubs: 'Hub',
    abstract: 'Abstract',
    planes: 'Planes',
    
    // Control labels
    'Project Name': 'Project Name',
    'Model Color': 'Model Color',
    'Edge Profile': 'Edge Profile',
    'Extrusion Depth': 'Extrusion Depth',
    'Global Boldness': 'Global Boldness',
    'Preview Resolution': 'Preview Resolution',
    'Generating Model': 'Generating Model',
    'Grid On': 'Grid On',
    'Grid Off': 'Grid Off',
    'Reference Radius': 'Reference Radius',
    'AI Randomizer': 'AI Randomizer',
    'Shuffle / Refresh': 'Shuffle / Refresh',
    'Reset on Shuffle': 'Reset on Shuffle',
    'Reset View': 'Reset View',
    'Tooltips': 'Tooltips',
    'Language': 'Language',
    'Cap Style': 'Cap Style',
    'Oscillation Enable': 'Oscillation Enable',
    'Sync All Planes': 'Sync All Planes',
    'Bevel Amount': 'Bevel Amount',
    'Fillet Detail': 'Fillet Detail',
    'Mirror Offset': 'Mirror Offset',
    'Mode': 'Mode',
    'Underline': 'Underline',
    'Underline Thickness': 'Underline Thickness',
    'Mirror Effect': 'Mirror Effect',
    'Inner Radius': 'Inner Radius',
    'Outer Radius': 'Outer Radius',
    'Diameter Mode': 'Diameter Mode',
    'Auto-fit': 'Auto-fit',
    'Fixed Size': 'Fixed Size',
    'Boldness': 'Boldness',
    'Letter Spacing': 'Letter Spacing',
    'Manual Rotation': 'Manual Rotation',
    'Arms / Symmetry': 'Arms / Symmetry',
    'Font Size': 'Font Size',
    'Font Search': 'Font Search',
    'Browse System Fonts': 'Browse System Fonts',
    'Requires Chrome/Edge': 'Requires Chrome/Edge',
    'System Fonts': 'System Fonts',
    'Upload Font': 'Upload Font',
    'Offset X': 'Offset X',
    'Offset Y': 'Offset Y',
    'Phrase Content': 'Phrase Content',
    'Primary': 'Primary',
    'Secondary': 'Secondary',
    'Fillet': 'Fillet',
    'Chamfer': 'Chamfer',
    'Active Plane Selector': 'Active Plane Selector',
    'Rotation': 'Rotation',
    'Amplitude': 'Amplitude',
    'Frequency': 'Frequency',
    'Hub Sides': 'Hub Sides',
    'Star Ratio': 'Star Ratio',
    'Hollow': 'Hollow',
    'Visible': 'Visible',
    'Hidden': 'Hidden',
    'Wall Thickness': 'Wall Thickness',
    'Hub Shape': 'Hub Shape',
    'Hub Properties': 'Hub Properties',
    'Hub Radius': 'Hub Radius',
    'None': 'None',
    'Export': 'Export',
    'Shuffle': 'Shuffle',
    'Refresh': 'Refresh',
    'Square': 'Square',
    'Round': 'Round',
    'Triangle': 'Triangle',
    'Cap Length': 'Cap Length',
    'Underline Start': 'Underline Start',
    'Underline Length': 'Underline Length',
    'Underline Mirror Offset': 'Underline Mirror Offset',
    'Slot Length Adj': 'Slot Length Adj',
    'Slot Width Offset': 'Slot Width Offset',
    'Slot Length': 'Slot Length',
    'Slot Width': 'Slot Width',
    'Random Seed': 'Random Seed',
    'Angle Variation': 'Angle Variation',
    'Length Variation': 'Length Variation',
    'Thickness Decay': 'Thickness Decay',
    'Rounded Tips': 'Rounded Tips',
    'Cut Slots': 'Cut Slots',
    'Export STL': 'Export STL',
    'Export All Planes': 'Export All Planes',
    'Combined STL': 'Combined STL',
    'Zip All STLs': 'Zip All STLs',
    'Auto-Configure Assembly Slots': 'Auto-Configure Assembly Slots',
    'Export Resolution': 'Export Resolution',
    'Abstract Outer Radius': 'Abstract Outer Radius',
    'Rot X': 'Rot X',
    'Rot Y': 'Rot Y',
    'Rot Z': 'Rot Z',
    'Leave blank for AI Randomizer to choose a word': 'Leave blank for AI Randomizer to choose a word',
    'Search Fonts...': 'Search Fonts...',
    'Save My Project': 'Save My Project',
    'Save': 'Save',
    'Load': 'Load',
    'Add Shape': 'Add Shape',
    '+ Shape': '+ Shape',
    'Shape': 'Shape',
    'Add Fractal': 'Add Fractal',
    '+ Fractal': '+ Fractal',
    'Fractal': 'Fractal',
    'Add Hub': 'Add Hub',
    '+ Hub': '+ Hub',
    'Delete Hub': 'Delete Hub',
    'Layer Name': 'Layer Name',
    'Tree Arms': 'Tree Arms',
    'Shape Arms': 'Shape Arms',
    'Branching Structure': 'Branching Structure',
    'Trunk Length': 'Trunk Length',
    'Branches Per Node': 'Branches Per Node',
    'Recursion Depth': 'Recursion Depth',
    'Min Branch Length': 'Min Branch Length',
    'Branch Pattern': 'Branch Pattern',
    'Branch Geometry': 'Branch Geometry',
    'Branch Angle': 'Branch Angle',
    'Branch Length': 'Branch Length',
    'Initial Length': 'Initial Length',
    'Length Decay': 'Length Decay',
    'Shape Settings': 'Shape Settings',
    'Fractal Settings': 'Fractal Settings',
    'symmetric': 'symmetric',
    'alternating': 'alternating',
    'random': 'random',
    'line': 'line',
    'sine': 'sine',
    'zigzag': 'zigzag',
    'All Planes': 'All Planes',
    'Selected Character': 'Selected Character',
    'circle': 'circle',
    'polygon': 'polygon',
    'star': 'star',
    'Chevron': 'Chevron',
    'Outer Diameter': 'Outer Diameter',
    'Visible_desc': 'Toggles visibility of this element in the design.',
    'Hidden_desc': 'Hides this element from the design.',
    'Delete_desc': 'Remove this element from the design.',
    'Delete Hub_desc': 'Remove this hub from the current plane.',
    'Reset View_desc': 'Reset the view to fit the content.',
    'Radius Lock': 'Radius Lock',
    'Radius Locked': 'Radius Locked',
    'Radius Unlocked': 'Radius Unlocked',
    'Export Layer': 'Export Layer',
    '2D Formats': '2D Formats',
    'SVG Vector': 'SVG Vector',
    'DXF (CAD)': 'DXF (CAD)',
    
    // Descriptions
    'Project Name_desc': 'The filename used when saving or exporting your design.',
    'Model Color_desc': 'The base color applied to the 3D mesh and 2D preview.',
    'Edge Profile_desc': 'Adds rounded or slanted edges to the 3D model for a more realistic look.',
    'Extrusion Depth_desc': 'The thickness of the 3D model when extruded.',
    'Global Boldness_desc': 'Adds stroke thickness to all text elements for a bolder appearance.',
    'Preview Resolution_desc': 'Quality level for the 2D preview rendering.',
    'AI Randomizer_desc': 'Uses AI to generate creative snowflake designs based on your text.',
    'Shuffle / Refresh_desc': 'Keeps the main text/design but re-randomizes parameters.',
    'Reset on Shuffle_desc': 'Starts over from scratch and generates a completely new model.',
    'Tooltips_desc': 'Show helpful tooltips when hovering over controls.',
    'Language_desc': 'Select the interface language.',
    
    // Quality levels
    low: 'Low',
    med: 'Med',
    high: 'High',
    
    // Common UI
    reset: 'Reset',
    cancel: 'Cancel',
    save: 'Save',
    settings: 'Settings',
    'Keyboard Shortcuts': 'Keyboard Shortcuts',
    'Reset Defaults': 'Reset Defaults',
    'Save Changes': 'Save Changes',
    'ON': 'ON',
    'OFF': 'OFF',
    
    // Shortcut actions
    switchToGlobalTab: 'Switch to Global Tab',
    switchToTextTab: 'Switch to Text Tab',
    switchToLetterCtrlTab: 'Switch to Letter Control Tab',
    switchToHubsTab: 'Switch to Hubs Tab',
    switchToAbstractTab: 'Switch to Abstract Tab',
    switchToPlanesTab: 'Switch to Planes Tab',
    toggleView: 'Toggle View',
    forceRegenerate: 'Force Regenerate',
    exportCombinedSTL: 'Export Combined STL',
    exportBasePlaneSTL: 'Export Base Plane STL',
    exportCrossPlaneSTL: 'Export Cross Plane STL',
    exportTiltPlaneSTL: 'Export Tilt Plane STL',
    saveProject: 'Save Project',
    loadProject: 'Load Project',
    undo: 'Undo',
    redo: 'Redo',
    
    // Languages
    'English': 'English',
    'Español': 'Español',
    'Français': 'Français',
    'Deutsch': 'Deutsch',
    '中文': '中文',
    '日本語': '日本語',
    
    // Layer names
    'Base Plane': 'Base Plane',
    'Cross Plane': 'Cross Plane',
    'Tilt Plane': 'Tilt Plane'
  },
  
  es: {
    // Tab labels
    global: 'Global',
    text: 'Texto',
    'Letter Ctrl': 'Control Letras',
    hubs: 'Centro',
    abstract: 'Abstracto',
    planes: 'Planos',
    
    // Control labels
    'Project Name': 'Nombre del Proyecto',
    'Model Color': 'Color del Modelo',
    'Edge Profile': 'Perfil del Borde',
    'Extrusion Depth': 'Profundidad de Extrusión',
    'Global Boldness': 'Grosor Global',
    'Preview Resolution': 'Resolución de Vista Previa',
    'Generating Model': 'Generando Modelo',
    'Grid On': 'Cuadrícula Activada',
    'Grid Off': 'Cuadrícula Desactivada',
    'Reference Radius': 'Radio de Referencia',
    'AI Randomizer': 'Generador IA',
    'Shuffle / Refresh': 'Mezclar / Actualizar',
    'Reset on Shuffle': 'Reiniciar al Mezclar',
    'Reset View': 'Restablecer Vista',
    'Tooltips': 'Tooltips',
    'Language': 'Idioma',
    'Cap Style': 'Estilo de Extremo',
    'Oscillation Enable': 'Activar Oscilación',
    'Sync All Planes': 'Sincronizar Todos los Planos',
    'Bevel Amount': 'Cantidad de Bisel',
    'Fillet Detail': 'Detalle de Filete',
    'Mirror Offset': 'Desplazamiento de Espejo',
    'Mode': 'Modo',
    'Underline': 'Subrayado',
    'Underline Thickness': 'Grosor de Subrayado',
    'Mirror Effect': 'Efecto Espejo',
    'Inner Radius': 'Radio Interior',
    'Outer Radius': 'Radio Exterior',
    'Diameter Mode': 'Modo de Diámetro',
    'Auto-fit': 'Ajuste Automático',
    'Fixed Size': 'Tamaño Fijo',
    'Boldness': 'Grosor',
    'Letter Spacing': 'Espaciado de Letras',
    'Manual Rotation': 'Rotación Manual',
    'Arms / Symmetry': 'Brazos / Simetría',
    'Font Size': 'Tamaño de Fuente',
    'Font Search': 'Buscar Fuente',
    'Browse System Fonts': 'Explorar Fuentes del Sistema',
    'Requires Chrome/Edge': 'Requiere Chrome/Edge',
    'System Fonts': 'Fuentes del Sistema',
    'Upload Font': 'Subir Fuente',
    'Offset X': 'Desplazamiento X',
    'Offset Y': 'Desplazamiento Y',
    'Phrase Content': 'Contenido de la Frase',
    'Primary': 'Primario',
    'Secondary': 'Secundario',
    'Fillet': 'Filete',
    'Chamfer': 'Chaflán',
    'Active Plane Selector': 'Selector de Plano Activo',
    'Rotation': 'Rotación',
    'Amplitude': 'Amplitud',
    'Frequency': 'Frecuencia',
    'Hub Sides': 'Lados del Centro',
    'Star Ratio': 'Proporción de Estrella',
    'Hollow': 'Hueco',
    'Visible': 'Visible',
    'Hidden': 'Oculto',
    'Wall Thickness': 'Grosor de Pared',
    'Hub Shape': 'Forma de Centro',
    'Hub Properties': 'Propiedades del Centro',
    'Hub Radius': 'Radio del Centro',
    'None': 'Ninguno',
    'Export': 'Exportar',
    'Shuffle': 'Mezclar',
    'Refresh': 'Actualizar',
    'Square': 'Cuadrado',
    'Round': 'Redondo',
    'Triangle': 'Triángulo',
    'Cap Length': 'Longitud de Extremo',
    'Underline Start': 'Inicio de Subrayado',
    'Underline Length': 'Longitud de Subrayado',
    'Underline Mirror Offset': 'Desplazamiento de Espejo de Subrayado',
    'Slot Length Adj': 'Ajuste de Longitud de Ranura',
    'Slot Width Offset': 'Desplazamiento de Ancho de Ranura',
    'Slot Length': 'Longitud de Ranura',
    'Slot Width': 'Ancho de Ranura',
    'Random Seed': 'Semilla Aleatoria',
    'Angle Variation': 'Variación de Ángulo',
    'Length Variation': 'Variación de Longitud',
    'Thickness Decay': 'Decaimiento de Grosor',
    'Rounded Tips': 'Puntas Redondeadas',
    'Cut Slots': 'Cortar Ranuras',
    'Export STL': 'Exportar STL',
    'Export All Planes': 'Exportar Todos los Planos',
    'Combined STL': 'STL Combinado',
    'Zip All STLs': 'Comprimir Todos los STL',
    'Auto-Configure Assembly Slots': 'Configurar Automáticamente Ranuras de Ensamblaje',
    'Export Resolution': 'Resolución de Exportación',
    'Abstract Outer Radius': 'Radio Exterior Abstracto',
    'Rot X': 'Rot X',
    'Rot Y': 'Rot Y',
    'Rot Z': 'Rot Z',
    'Leave blank for AI Randomizer to choose a word': 'Dejar en blanco para que el AI Randomizador elija una palabra',
    'Search Fonts...': 'Buscar Fuentes...',
    'Save My Project': 'Guardar Mi Proyecto',
    'Save': 'Guardar',
    'Load': 'Cargar',
    'Add Shape': 'Agregar Forma',
    '+ Shape': '+ Forma',
    'Shape': 'Forma',
    'Add Fractal': 'Agregar Fractal',
    '+ Fractal': '+ Fractal',
    'Fractal': 'Fractal',
    'Add Hub': 'Agregar Centro',
    '+ Hub': '+ Centro',
    'Delete Hub': 'Eliminar Centro',
    'Layer Name': 'Nombre de Capa',
    'Tree Arms': 'Brazos de Árbol',
    'Shape Arms': 'Brazos de Forma',
    'Branching Structure': 'Estructura de Ramificación',
    'Trunk Length': 'Longitud del Tronco',
    'Branches Per Node': 'Ramas por Nodo',
    'Recursion Depth': 'Profundidad de Recursión',
    'Min Branch Length': 'Longitud Mínima de Rama',
    'Branch Pattern': 'Patrón de Rama',
    'Branch Geometry': 'Geometría de Rama',
    'Branch Angle': 'Ángulo de Rama',
    'Branch Length': 'Longitud de Rama',
    'Initial Length': 'Longitud Inicial',
    'Length Decay': 'Decaimiento de Longitud',
    'Shape Settings': 'Configuración de Forma',
    'Fractal Settings': 'Configuración de Fractal',
    'symmetric': 'simétrico',
    'alternating': 'alterno',
    'random': 'aleatorio',
    'line': 'línea',
    'sine': 'seno',
    'zigzag': 'zigzag',
    'All Planes': 'Todos los Planos',
    'Selected Character': 'Carácter Seleccionado',
    'circle': 'círculo',
    'polygon': 'polígono',
    'star': 'estrella',
    'Chevron': 'Chevrón',
    'Outer Diameter': 'Diámetro Externo',
    'Visible_desc': 'Alterna la visibilidad de este elemento en el diseño.',
    'Hidden_desc': 'Oculta este elemento del diseño.',
    'Delete_desc': 'Eliminar este elemento del diseño.',
    'Delete Hub_desc': 'Eliminar este centro del plano actual.',
    'Reset View_desc': 'Restablecer la vista para ajustar el contenido.',
    'Radius Lock': 'Bloqueo de Radio',
    'Radius Locked': 'Radio Bloqueado',
    'Radius Unlocked': 'Radio Desbloqueado',
    'Export Layer': 'Exportar Capa',
    '2D Formats': 'Formatos 2D',
    'SVG Vector': 'Vector SVG',
    'DXF (CAD)': 'DXF (CAD)',
    
    // Descriptions
    'Project Name_desc': 'El nombre de archivo usado al guardar o exportar tu diseño.',
    'Model Color_desc': 'El color base aplicado al modelo 3D y vista previa 2D.',
    'Edge Profile_desc': 'Añade bordes redondeados o inclinados al modelo 3D para un aspecto más realista.',
    'Extrusion Depth_desc': 'La profundidad del modelo 3D cuando se extruye.',
    'Global Boldness_desc': 'Añade grosor de trazo a todos los elementos de texto para una apariencia más audaz.',
    'Preview Resolution_desc': 'Nivel de calidad para el renderizado de vista previa 2D.',
    'AI Randomizer_desc': 'Usa IA para generar diseños de copos de nieve creativos basados en tu texto.',
    'Shuffle / Refresh_desc': 'Mantiene el texto/diseño principal pero re-randomiza los parámetros.',
    'Reset on Shuffle_desc': 'Comienza desde cero y genera un modelo completamente nuevo.',
    'Tooltips_desc': 'Mostrar tooltips útiles al pasar el cursor sobre los controles.',
    'Language_desc': 'Seleccionar el idioma de la interfaz.',
    
    // Quality levels
    low: 'Bajo',
    med: 'Med',
    high: 'Alto',
    
    // Common UI
    reset: 'Reiniciar',
    cancel: 'Cancelar',
    save: 'Guardar',
    settings: 'Configuración',
    'Keyboard Shortcuts': 'Atajos de Teclado',
    'Reset Defaults': 'Restablecer Predeterminados',
    'Save Changes': 'Guardar Cambios',
    'ON': 'ENCENDIDO',
    'OFF': 'APAGADO',
    
    // Shortcut actions
    switchToGlobalTab: 'Cambiar a Pestaña Global',
    switchToTextTab: 'Cambiar a Pestaña Texto',
    switchToLetterCtrlTab: 'Cambiar a Pestaña Control Letras',
    switchToHubsTab: 'Cambiar a Pestaña Centro',
    switchToAbstractTab: 'Cambiar a Pestaña Abstracto',
    switchToPlanesTab: 'Cambiar a Pestaña Planos',
    toggleView: 'Alternar Vista',
    forceRegenerate: 'Forzar Regeneración',
    exportCombinedSTL: 'Exportar STL Combinado',
    exportBasePlaneSTL: 'Exportar STL Plano Base',
    exportCrossPlaneSTL: 'Exportar STL Plano Cruzado',
    exportTiltPlaneSTL: 'Exportar STL Plano Inclinado',
    saveProject: 'Guardar Proyecto',
    loadProject: 'Cargar Proyecto',
    undo: 'Deshacer',
    redo: 'Rehacer',
    
    // Languages
    'English': 'English',
    'Español': 'Español',
    'Français': 'Français',
    'Deutsch': 'Deutsch',
    '中文': '中文',
    '日本語': '日本語',
    
    // Layer names
    'Base Plane': 'Plano Base',
    'Cross Plane': 'Plano Cruzado',
    'Tilt Plane': 'Plano Inclinado'
  },
  
  fr: {
    // Tab labels
    global: 'Global',
    text: 'Texte',
    'Letter Ctrl': 'Contrôle Lettres',
    hubs: 'Centre',
    abstract: 'Abstrait',
    planes: 'Plans',
    
    // Control labels
    'Project Name': 'Nom du Projet',
    'Model Color': 'Couleur du Modèle',
    'Edge Profile': 'Profil du Bord',
    'Extrusion Depth': 'Profondeur d\'Extrusion',
    'Global Boldness': 'Épaisseur Globale',
    'Preview Resolution': 'Résolution de l\'Aperçu',
    'Generating Model': 'Génération du Modèle',
    'Grid On': 'Grille Activée',
    'Grid Off': 'Grille Désactivée',
    'Reference Radius': 'Rayon de Référence',
    'AI Randomizer': 'Générateur IA',
    'Shuffle / Refresh': 'Mélanger / Actualiser',
    'Reset on Shuffle': 'Réinitialiser au Mélange',
    'Reset View': 'Réinitialiser la Vue',
    'Tooltips': 'Tooltips',
    'Language': 'Langue',
    'Cap Style': 'Style d\'Extremo',
    'Oscillation Enable': 'Activer Oscillation',
    'Sync All Planes': 'Synchroniser Tous les Plans',
    'Bevel Amount': 'Quantité de Biseau',
    'Fillet Detail': 'Détail de Filet',
    'Mirror Offset': 'Décalage de Miroir',
    'Mode': 'Mode',
    'Underline': 'Souligné',
    'Underline Thickness': 'Épaisseur de Souligné',
    'Mirror Effect': 'Effet Miroir',
    'Inner Radius': 'Rayon Intérieur',
    'Outer Radius': 'Rayon Extérieur',
    'Diameter Mode': 'Mode de Diamètre',
    'Auto-fit': 'Ajustement Auto',
    'Fixed Size': 'Taille Fixe',
    'Boldness': 'Épaisseur',
    'Letter Spacing': 'Espacement des Lettres',
    'Manual Rotation': 'Rotation Manuelle',
    'Arms / Symmetry': 'Bras / Symétrie',
    'Font Size': 'Taille de Police',
    'Font Search': 'Rechercher Police',
    'Browse System Fonts': 'Parcourir les Polices Système',
    'Requires Chrome/Edge': 'Nécessite Chrome/Edge',
    'System Fonts': 'Polices Système',
    'Upload Font': 'Télécharger Police',
    'Offset X': 'Décalage X',
    'Offset Y': 'Décalage Y',
    'Phrase Content': 'Contenu de la Phrase',
    'Primary': 'Primaire',
    'Secondary': 'Secondaire',
    'Fillet': 'Filet',
    'Chamfer': 'Biseau',
    'Active Plane Selector': 'Sélecteur de Plan Actif',
    'Rotation': 'Rotation',
    'Amplitude': 'Amplitude',
    'Frequency': 'Fréquence',
    'Hub Sides': 'Côtés du Centre',
    'Star Ratio': 'Ratio d\'Étoile',
    'Hollow': 'Creux',
    'Visible': 'Visible',
    'Hidden': 'Caché',
    'Wall Thickness': 'Épaisseur de Paroi',
    'Hub Shape': 'Forme du Centre',
    'Hub Properties': 'Propriétés du Centre',
    'Hub Radius': 'Rayon du Centre',
    'None': 'Aucun',
    'Export': 'Exporter',
    'Shuffle': 'Mélanger',
    'Refresh': 'Actualiser',
    'Square': 'Carré',
    'Round': 'Rond',
    'Triangle': 'Triangle',
    'Cap Length': 'Longueur d\'Extremo',
    'Underline Start': 'Début de Souligné',
    'Underline Length': 'Longueur de Souligné',
    'Underline Mirror Offset': 'Décalage de Miroir de Souligné',
    'Slot Length Adj': 'Ajustement de Longueur de Fente',
    'Slot Width Offset': 'Décalage de Largeur de Fente',
    'Slot Length': 'Longueur de Fente',
    'Slot Width': 'Largeur de Fente',
    'Random Seed': 'Graine Aléatoire',
    'Angle Variation': 'Variation d\'Angle',
    'Length Variation': 'Variation de Longueur',
    'Thickness Decay': 'Décroissance d\'Épaisseur',
    'Rounded Tips': 'Pointes Arrondies',
    'Cut Slots': 'Couper Fentes',
    'Export STL': 'Exporter STL',
    'Export All Planes': 'Exporter Tous les Plans',
    'Combined STL': 'STL Combiné',
    'Zip All STLs': 'Compresser Tous les STL',
    'Auto-Configure Assembly Slots': 'Configurer Automatiquement Fentes d\'Assemblage',
    'Export Resolution': 'Résolution d\'Exportation',
    'Abstract Outer Radius': 'Rayon Extérieur Abstrait',
    'Rot X': 'Rot X',
    'Rot Y': 'Rot Y',
    'Rot Z': 'Rot Z',
    'Leave blank for AI Randomizer to choose a word': 'Laisser vide pour que le Générateur IA choisisse un mot',
    'Search Fonts...': 'Rechercher des polices...',
    'Save My Project': 'Sauvegarder Mon Projet',
    'Save': 'Sauvegarder',
    'Load': 'Charger',
    'Add Shape': 'Ajouter une Forme',
    '+ Shape': '+ Forme',
    'Shape': 'Forme',
    'Add Fractal': 'Ajouter une Fractale',
    '+ Fractal': '+ Fractale',
    'Fractal': 'Fractale',
    'Add Hub': 'Ajouter un Centre',
    '+ Hub': '+ Centre',
    'Delete Hub': 'Supprimer le Centre',
    'Layer Name': 'Nom de Couche',
    'Tree Arms': 'Branches d\'Arbre',
    'Shape Arms': 'Branches de Forme',
    'Branching Structure': 'Structure de Branchement',
    'Trunk Length': 'Longueur du Tronc',
    'Branches Per Node': 'Branches par Nœud',
    'Recursion Depth': 'Profondeur de Récursion',
    'Min Branch Length': 'Longueur Minimale de Branche',
    'Branch Pattern': 'Motif de Branche',
    'Branch Geometry': 'Géométrie de Branche',
    'Branch Angle': 'Angle de Branche',
    'Branch Length': 'Longueur de Branche',
    'Initial Length': 'Longueur Initiale',
    'Length Decay': 'Décroissance de Longueur',
    'Shape Settings': 'Paramètres de Forme',
    'Fractal Settings': 'Paramètres de Fractale',
    'symmetric': 'symétrique',
    'alternating': 'alterné',
    'random': 'aléatoire',
    'line': 'ligne',
    'sine': 'sinus',
    'zigzag': 'zigzag',
    'All Planes': 'Tous les Plans',
    'Selected Character': 'Caractère Sélectionné',
    'circle': 'cercle',
    'polygon': 'polygone',
    'star': 'étoile',
    'Chevron': 'Chevron',
    'Outer Diameter': 'Diamètre Extérieur',
    'Visible_desc': 'Active/désactive la visibilité de cet élément dans le design.',
    'Hidden_desc': 'Cache cet élément du design.',
    'Delete_desc': 'Supprimer cet élément du design.',
    'Delete Hub_desc': 'Supprimer ce centre du plan actuel.',
    'Reset View_desc': 'Réinitialiser la vue pour ajuster le contenu.',
    'Radius Lock': 'Verrouillage du Rayon',
    'Radius Locked': 'Rayon Verrouillé',
    'Radius Unlocked': 'Rayon Déverrouillé',
    'Export Layer': 'Exporter la Couche',
    '2D Formats': 'Formats 2D',
    'SVG Vector': 'Vecteur SVG',
    'DXF (CAD)': 'DXF (CAD)',
    
    // Descriptions
    'Project Name_desc': 'Le nom de fichier utilisé lors de la sauvegarde ou exportation de votre design.',
    'Model Color_desc': 'La couleur de base appliquée au maillage 3D et à l\'aperçu 2D.',
    'Edge Profile_desc': 'Ajoute des bords arrondis ou inclinés au modèle 3D pour un look plus réaliste.',
    'Extrusion Depth_desc': 'L\'épaisseur du modèle 3D lorsqu\'il est extrudé.',
    'Global Boldness_desc': 'Ajoute une épaisseur de trait à tous les éléments de texte pour une apparence plus audacieuse.',
    'Preview Resolution_desc': 'Niveau de qualité pour le rendu de l\'aperçu 2D.',
    'AI Randomizer_desc': 'Utilise l\'IA pour générer des designs de flocons de neige créatifs basés sur votre texte.',
    'Shuffle / Refresh_desc': 'Garde le texte/design principal mais re-randomise les paramètres.',
    'Reset on Shuffle_desc': 'Recommence à zéro et génère un modèle complètement nouveau.',
    'Tooltips_desc': 'Afficher des tooltips utiles en survolant les contrôles.',
    'Language_desc': 'Sélectionner la langue de l\'interface.',
    
    // Quality levels
    low: 'Bas',
    med: 'Moyen',
    high: 'Élevé',
    
    // Common UI
    reset: 'Réinitialiser',
    cancel: 'Annuler',
    save: 'Sauvegarder',
    settings: 'Paramètres',
    'Keyboard Shortcuts': 'Raccourcis Clavier',
    'Reset Defaults': 'Réinitialiser Défauts',
    'Save Changes': 'Sauvegarder les Changements',
    'ON': 'MARCHE',
    'OFF': 'ARRÊT',
    
    // Shortcut actions
    switchToGlobalTab: 'Basculer vers l\'Onglet Global',
    switchToTextTab: 'Basculer vers l\'Onglet Texte',
    switchToLetterCtrlTab: 'Basculer vers l\'Onglet Contrôle Lettres',
    switchToHubsTab: 'Basculer vers l\'Onglet Centre',
    switchToAbstractTab: 'Basculer vers l\'Onglet Abstrait',
    switchToPlanesTab: 'Basculer vers l\'Onglet Plans',
    toggleView: 'Basculer Vue',
    forceRegenerate: 'Forcer Régénération',
    exportCombinedSTL: 'Exporter STL Combiné',
    exportBasePlaneSTL: 'Exporter STL Plan de Base',
    exportCrossPlaneSTL: 'Exporter STL Plan Croisé',
    exportTiltPlaneSTL: 'Exporter STL Plan Incliné',
    saveProject: 'Sauvegarder Projet',
    loadProject: 'Charger Projet',
    undo: 'Annuler',
    redo: 'Refaire',
    
    // Languages
    'English': 'English',
    'Español': 'Español',
    'Français': 'Français',
    'Deutsch': 'Deutsch',
    '中文': '中文',
    '日本語': '日本語',
    
    // Layer names
    'Base Plane': 'Plan de Base',
    'Cross Plane': 'Plan Croisé',
    'Tilt Plane': 'Plan Incliné'
  },
  
  de: {
    // Tab labels
    global: 'Global',
    text: 'Text',
    'Letter Ctrl': 'Buchstaben-Steuerung',
    hubs: 'Mitte',
    abstract: 'Abstrakt',
    planes: 'Ebenen',
    
    // Control labels
    'Project Name': 'Projektname',
    'Model Color': 'Modellfarbe',
    'Edge Profile': 'Kantenprofil',
    'Extrusion Depth': 'Extrusionstiefe',
    'Global Boldness': 'Globale Fettigkeit',
    'Preview Resolution': 'Vorschau-Auflösung',
    'Generating Model': 'Modell wird Generiert',
    'Grid On': 'Raster Aktiviert',
    'Grid Off': 'Raster Deaktiviert',
    'Reference Radius': 'Referenzradius',
    'AI Randomizer': 'KI-Generator',
    'Shuffle / Refresh': 'Mischen / Aktualisieren',
    'Reset on Shuffle': 'Beim Mischen Zurücksetzen',
    'Reset View': 'Ansicht Zurücksetzen',
    'Tooltips': 'Tooltips',
    'Language': 'Sprache',
    'Cap Style': 'Kappenstil',
    'Oscillation Enable': 'Oszillation Aktivieren',
    'Sync All Planes': 'Alle Ebenen Synchronisieren',
    'Bevel Amount': 'Kantenmenge',
    'Fillet Detail': 'Verrundungsdetail',
    'Mirror Offset': 'Spiegelversatz',
    'Mode': 'Modus',
    'Underline': 'Unterstrich',
    'Underline Thickness': 'Unterstreichungsstärke',
    'Mirror Effect': 'Spiegeleffekt',
    'Radius Lock': 'Radius-Sperre',
    'Radius Locked': 'Radius Gesperrt',
    'Radius Unlocked': 'Radius Entsperrt',
    'Inner Radius': 'Innerer Radius',
    'Outer Radius': 'Äußerer Radius',
    'Diameter Mode': 'Durchmesser-Modus',
    'Auto-fit': 'Automatisch Anpassen',
    'Fixed Size': 'Feste Größe',
    'Boldness': 'Fettigkeit',
    'Letter Spacing': 'Buchstabenabstand',
    'Manual Rotation': 'Manuelle Rotation',
    'Arms / Symmetry': 'Arme / Symmetrie',
    'Font Size': 'Schriftgröße',
    'Font Search': 'Schriftsuche',
    'Browse System Fonts': 'System-Schriftarten Durchsuchen',
    'Requires Chrome/Edge': 'Erfordert Chrome/Edge',
    'System Fonts': 'Systemschriftarten',
    'Upload Font': 'Schrift Hochladen',
    'Offset X': 'Versatz X',
    'Offset Y': 'Versatz Y',
    'Phrase Content': 'Phraseninhalt',
    'Primary': 'Primär',
    'Secondary': 'Sekundär',
    'Fillet': 'Verrundung',
    'Chamfer': 'Fase',
    'Active Plane Selector': 'Aktive Ebenenauswahl',
    'Rotation': 'Rotation',
    'Amplitude': 'Amplitude',
    'Frequency': 'Frequenz',
    'Hub Sides': 'Naben Seiten',
    'Star Ratio': 'Sternverhältnis',
    'Hollow': 'Hohl',
    'Visible': 'Sichtbar',
    'Hidden': 'Versteckt',
    'Wall Thickness': 'Wandstärke',
    'Hub Shape': 'Zentrumform',
    'Hub Properties': 'Zentrumseigenschaften',
    'Hub Radius': 'Nabenradius',
    'None': 'Keine',
    'Export': 'Exportieren',
    'Shuffle': 'Mischen',
    'Refresh': 'Aktualisieren',
    'Square': 'Quadrat',
    'Round': 'Rund',
    'Triangle': 'Dreieck',
    'Cap Length': 'Kappenlänge',
    'Underline Start': 'Unterstrich Start',
    'Underline Length': 'Unterstrich Länge',
    'Underline Mirror Offset': 'Unterstrich Spiegelversatz',
    'Slot Length Adj': 'Schlitzlänge Anpassung',
    'Slot Width Offset': 'Schlitzbreite Versatz',
    'Slot Length': 'Schlitzlänge',
    'Slot Width': 'Schlitzbreite',
    'Random Seed': 'Zufallssamen',
    'Angle Variation': 'Winkelvariation',
    'Length Variation': 'Längenvariation',
    'Thickness Decay': 'Dickendecay',
    'Rounded Tips': 'Abgerundete Spitzen',
    'Cut Slots': 'Schlitze Schneiden',
    'Export STL': 'STL Exportieren',
    'Export All Planes': 'Alle Ebenen Exportieren',
    'Combined STL': 'Kombinierter STL',
    'Zip All STLs': 'Alle STLs Komprimieren',
    'Auto-Configure Assembly Slots': 'Montageschlitze Automatisch Konfigurieren',
    'Export Resolution': 'Exportauflösung',
    'Abstract Outer Radius': 'Abstrakter Äußerer Radius',
    'Rot X': 'Rot X',
    'Rot Y': 'Rot Y',
    'Rot Z': 'Rot Z',
    'Leave blank for AI Randomizer to choose a word': 'Leer lassen damit KI-Generator ein Wort wählt',
    'Search Fonts...': 'Schriftarten suchen...',
    'Save My Project': 'Mein Projekt Speichern',
    'Save': 'Speichern',
    'Load': 'Laden',
    'Add Shape': 'Form Hinzufügen',
    '+ Shape': '+ Form',
    'Shape': 'Form',
    'Add Fractal': 'Fraktal Hinzufügen',
    '+ Fractal': '+ Fraktal',
    'Fractal': 'Fraktal',
    'Add Hub': 'Zentrum Hinzufügen',
    '+ Hub': '+ Zentrum',
    'Delete Hub': 'Zentrum Löschen',
    'Layer Name': 'Ebenenname',
    'Tree Arms': 'Baumarme',
    'Shape Arms': 'Formarme',
    'Branching Structure': 'Verzweigungsstruktur',
    'Trunk Length': 'Stammlänge',
    'Branches Per Node': 'Äste pro Knoten',
    'Recursion Depth': 'Rekursionstiefe',
    'Min Branch Length': 'Mindeste Astlänge',
    'Branch Pattern': 'Astmuster',
    'Branch Geometry': 'Astgeometrie',
    'Branch Angle': 'Astwinkel',
    'Branch Length': 'Astlänge',
    'Initial Length': 'Anfangslänge',
    'Length Decay': 'Längenabnahme',
    'Shape Settings': 'Formeinstellungen',
    'Fractal Settings': 'Fraktaleinstellungen',
    'symmetric': 'symmetrisch',
    'alternating': 'abwechselnd',
    'random': 'zufällig',
    'line': 'Linie',
    'sine': 'Sinus',
    'zigzag': 'Zickzack',
    'All Planes': 'Alle Ebenen',
    'Selected Character': 'Ausgewähltes Zeichen',
    'circle': 'Kreis',
    'polygon': 'Polygon',
    'star': 'Stern',
    'Chevron': 'Chevron',
    'Outer Diameter': 'Außendurchmesser',
    'Visible_desc': 'Schaltet die Sichtbarkeit dieses Elements im Design ein/aus.',
    'Hidden_desc': 'Versteckt dieses Element im Design.',
    'Delete_desc': 'Dieses Element aus dem Design entfernen.',
    'Delete Hub_desc': 'Dieses Zentrum aus der aktuellen Ebene entfernen.',
    'Reset View_desc': 'Ansicht zurücksetzen, um den Inhalt anzupassen.',
    'Export Layer': 'Ebene Exportieren',
    '2D Formats': '2D-Formate',
    'SVG Vector': 'SVG-Vektor',
    'DXF (CAD)': 'DXF (CAD)',
    
    // Descriptions
    'Project Name_desc': 'Der Dateiname beim Speichern oder Exportieren Ihres Designs.',
    'Model Color_desc': 'Die Grundfarbe auf das 3D-Modell und 2D-Vorschau angewendet.',
    'Edge Profile_desc': 'Fügt abgerundete oder geneigte Kanten zum 3D-Modell für realistischeres Aussehen hinzu.',
    'Extrusion Depth_desc': 'Die Dicke des 3D-Modells bei Extrusion.',
    'Global Boldness_desc': 'Fügt Strichstärke zu allen Textelementen für kräftigeres Erscheinungsbild hinzu.',
    'Preview Resolution_desc': 'Qualitätsstufe für das 2D-Vorschau-Rendering.',
    'AI Randomizer_desc': 'Verwendet KI um kreative Schneeflocken-Designs basierend auf Ihrem Text zu generieren.',
    'Shuffle / Refresh_desc': 'Behält Haupttext/Design bei aber randomisiert Parameter neu.',
    'Reset on Shuffle_desc': 'Startet von vorne und generiert ein völlig neues Modell.',
    'Tooltips_desc': 'Nützliche Tooltips beim Überfahren von Steuerelementen anzeigen.',
    'Language_desc': 'Oberflächensprache auswählen.',
    
    // Quality levels
    low: 'Niedrig',
    med: 'Mittel',
    high: 'Hoch',
    
    // Common UI
    reset: 'Zurücksetzen',
    cancel: 'Abbrechen',
    save: 'Speichern',
    settings: 'Einstellungen',
    'Keyboard Shortcuts': 'Tastaturkürzel',
    'Reset Defaults': 'Standard zurücksetzen',
    'Save Changes': 'Änderungen speichern',
    'ON': 'EIN',
    'OFF': 'AUS',
    
    // Shortcut actions
    switchToGlobalTab: 'Zu Global-Tab wechseln',
    switchToTextTab: 'Zu Text-Tab wechseln',
    switchToLetterCtrlTab: 'Zu Buchstaben-Steuerungs-Tab wechseln',
    switchToHubsTab: 'Zu Mitte-Tab wechseln',
    switchToAbstractTab: 'Zu Abstrakt-Tab wechseln',
    switchToPlanesTab: 'Zu Ebenen-Tab wechseln',
    toggleView: 'Ansicht umschalten',
    forceRegenerate: 'Regeneration erzwingen',
    exportCombinedSTL: 'Kombinierte STL exportieren',
    exportBasePlaneSTL: 'Basis-Ebene STL exportieren',
    exportCrossPlaneSTL: 'Kreuz-Ebene STL exportieren',
    exportTiltPlaneSTL: 'Geneigte-Ebene STL exportieren',
    saveProject: 'Projekt speichern',
    loadProject: 'Projekt laden',
    undo: 'Rückgängig',
    redo: 'Wiederherstellen',
    
    // Languages
    'English': 'English',
    'Español': 'Español',
    'Français': 'Français',
    'Deutsch': 'Deutsch',
    '中文': '中文',
    '日本語': '日本語',
    
    // Layer names
    'Base Plane': 'Basis-Ebene',
    'Cross Plane': 'Kreuz-Ebene',
    'Tilt Plane': 'Geneigte-Ebene'
  },
  
  zh: {
    // Tab labels
    global: '全局',
    text: '文本',
    'Letter Ctrl': '字母控制',
    hubs: '中心',
    abstract: '抽象',
    planes: '平面',
    
    // Control labels
    'Project Name': '项目名称',
    'Model Color': '模型颜色',
    'Edge Profile': '边缘轮廓',
    'Extrusion Depth': '挤出深度',
    'Global Boldness': '全局粗体',
    'Preview Resolution': '预览分辨率',
    'Generating Model': '正在生成模型',
    'Grid On': '网格开启',
    'Grid Off': '网格关闭',
    'Reference Radius': '参考半径',
    'AI Randomizer': 'AI随机生成器',
    'Shuffle / Refresh': '随机/刷新',
    'Reset on Shuffle': '随机时重置',
    'Reset View': '重置视图',
    'Tooltips': '工具提示',
    'Language': '语言',
    'Cap Style': '端盖样式',
    'Oscillation Enable': '启用振荡',
    'Sync All Planes': '同步所有平面',
    'Bevel Amount': '倒角量',
    'Fillet Detail': '圆角细节',
    'Mirror Offset': '镜像偏移',
    'Mode': '模式',
    'Underline': '下划线',
    'Underline Thickness': '下划线粗细',
    'Mirror Effect': '镜像效果',
    'Radius Lock': '半径锁定',
    'Radius Locked': '半径已锁定',
    'Radius Unlocked': '半径未锁定',
    'Inner Radius': '内半径',
    'Outer Radius': '外半径',
    'Diameter Mode': '直径模式',
    'Auto-fit': '自动适应',
    'Fixed Size': '固定尺寸',
    'Boldness': '粗体',
    'Letter Spacing': '字母间距',
    'Manual Rotation': '手动旋转',
    'Arms / Symmetry': '臂/对称',
    'Font Size': '字体大小',
    'Font Search': '字体搜索',
    'Browse System Fonts': '浏览系统字体',
    'Requires Chrome/Edge': '需要 Chrome/Edge',
    'System Fonts': '系统字体',
    'Upload Font': '上传字体',
    'Offset X': 'X偏移',
    'Offset Y': 'Y偏移',
    'Phrase Content': '短语内容',
    'Primary': '主要',
    'Secondary': '次要',
    'Fillet': '圆角',
    'Chamfer': '倒角',
    'Active Plane Selector': '活动平面选择器',
    'Rotation': '旋转',
    'Amplitude': '振幅',
    'Frequency': '频率',
    'Hub Sides': '中心边数',
    'Star Ratio': '星形比例',
    'Hollow': '空心',
    'Visible': '可见',
    'Hidden': '隐藏',
    'Wall Thickness': '壁厚',
    'Hub Shape': '中心形状',
    'Hub Properties': '中心属性',
    'Hub Radius': '中心半径',
    'Export': '导出',
    'Shuffle': '随机',
    'Refresh': '刷新',
    'Square': '方形',
    'Round': '圆形',
    'Triangle': '三角形',
    'None': '无',
    'Cap Length': '端盖长度',
    'Underline Start': '下划线起点',
    'Underline Length': '下划线长度',
    'Underline Mirror Offset': '下划线镜像偏移',
    'Slot Length Adj': '槽长调整',
    'Slot Width Offset': '槽宽偏移',
    'Slot Length': '槽长',
    'Slot Width': '槽宽',
    'Random Seed': '随机种子',
    'Angle Variation': '角度变化',
    'Length Variation': '长度变化',
    'Thickness Decay': '厚度衰减',
    'Rounded Tips': '圆角尖端',
    'Cut Slots': '切割槽',
    'Export STL': '导出STL',
    'Export All Planes': '导出所有平面',
    'Combined STL': '合并STL',
    'Zip All STLs': '压缩所有STL',
    'Auto-Configure Assembly Slots': '自动配置装配槽',
    'Export Resolution': '导出分辨率',
    'Abstract Outer Radius': '抽象外半径',
    'Rot X': 'X旋转',
    'Rot Y': 'Y旋转',
    'Rot Z': 'Z旋转',
    'Leave blank for AI Randomizer to choose a word': '留空让AI随机生成器选择单词',
    'Search Fonts...': '搜索字体...',
    'Save My Project': '保存我的项目',
    'Save': '保存',
    'Load': '加载',
    'Add Shape': '添加形状',
    '+ Shape': '+ 形状',
    'Shape': '形状',
    'Add Fractal': '添加分形',
    '+ Fractal': '+ 分形',
    'Fractal': '分形',
    'Add Hub': '添加中心',
    '+ Hub': '+ 中心',
    'Delete Hub': '删除中心',
    'Layer Name': '图层名称',
    'Tree Arms': '树枝臂',
    'Shape Arms': '形状臂',
    'Branching Structure': '分支结构',
    'Trunk Length': '树干长度',
    'Branches Per Node': '每节点分支数',
    'Recursion Depth': '递归深度',
    'Min Branch Length': '最小分支长度',
    'Branch Pattern': '分支模式',
    'Branch Geometry': '分支几何',
    'Branch Angle': '分支角度',
    'Branch Length': '分支长度',
    'Initial Length': '初始长度',
    'Length Decay': '长度衰减',
    'Shape Settings': '形状设置',
    'Fractal Settings': '分形设置',
    'symmetric': '对称',
    'alternating': '交替',
    'random': '随机',
    'line': '直线',
    'sine': '正弦',
    'zigzag': '锯齿',
    'All Planes': '所有平面',
    'Selected Character': '选中字符',
    'circle': '圆形',
    'polygon': '多边形',
    'star': '星形',
    'Chevron': 'V形',
    'Outer Diameter': '外径',
    'Visible_desc': '切换设计中此元素的可见性。',
    'Hidden_desc': '隐藏设计中的此元素。',
    'Delete_desc': '从设计中移除此元素。',
    'Delete Hub_desc': '从当前平面移除此中心。',
    'Reset View_desc': '重置视图以适应内容。',
    'Export Layer': '导出图层',
    '2D Formats': '2D格式',
    'SVG Vector': 'SVG矢量',
    'DXF (CAD)': 'DXF (CAD)',
    
    // Descriptions
    'Project Name_desc': '保存或导出设计时使用的文件名。',
    'Model Color_desc': '应用于3D网格和2D预览的基础颜色。',
    'Edge Profile_desc': '为3D模型添加圆角或斜角边缘以获得更真实的外观。',
    'Extrusion Depth_desc': '3D模型挤出时的厚度。',
    'Global Boldness_desc': '为所有文本元素添加笔画粗细以获得更粗的外观。',
    'Preview Resolution_desc': '2D预览渲染的质量级别。',
    'AI Randomizer_desc': '使用AI根据您的文本生成创意雪花设计。',
    'Shuffle / Refresh_desc': '保持主要文本/设计但重新随机化参数。',
    'Reset on Shuffle_desc': '从头开始生成一个全新的模型。',
    'Tooltips_desc': '悬停在控件上时显示有用的工具提示。',
    'Language_desc': '选择界面语言。',
    
    // Quality levels
    low: '低',
    med: '中',
    high: '高',
    
    // Common UI
    reset: '重置',
    cancel: '取消',
    save: '保存',
    settings: '设置',
    'Keyboard Shortcuts': '键盘快捷键',
    'Reset Defaults': '重置默认值',
    'Save Changes': '保存更改',
    'ON': '开',
    'OFF': '关',
    
    // Shortcut actions
    switchToGlobalTab: '切换到全局标签页',
    switchToTextTab: '切换到文本标签页',
    switchToLetterCtrlTab: '切换到字母控制标签页',
    switchToHubsTab: '切换到中心标签页',
    switchToAbstractTab: '切换到抽象标签页',
    switchToPlanesTab: '切换到平面标签页',
    toggleView: '切换视图',
    forceRegenerate: '强制重新生成',
    exportCombinedSTL: '导出组合STL',
    exportBasePlaneSTL: '导出基础平面STL',
    exportCrossPlaneSTL: '导出交叉平面STL',
    exportTiltPlaneSTL: '导出倾斜平面STL',
    saveProject: '保存项目',
    loadProject: '加载项目',
    undo: '撤销',
    redo: '重做',
    
    // Languages
    'English': 'English',
    'Español': 'Español',
    'Français': 'Français',
    'Deutsch': 'Deutsch',
    '中文': '中文',
    '日本語': '日本語',
    
    // Layer names
    'Base Plane': '基础平面',
    'Cross Plane': '交叉平面',
    'Tilt Plane': '倾斜平面'
  },
  
  ja: {
    // Tab labels
    global: 'グローバル',
    text: 'テキスト',
    'Letter Ctrl': '文字コントロール',
    hubs: 'ハブ',
    abstract: '抽象',
    planes: '平面',
    
    // Control labels
    'Project Name': 'プロジェクト名',
    'Model Color': 'モデルカラー',
    'Edge Profile': 'エッジプロファイル',
    'Extrusion Depth': '押し出し深度',
    'Global Boldness': 'グローバル太字',
    'Preview Resolution': 'プレビュー解像度',
    'Generating Model': 'モデルを生成中',
    'Grid On': 'グリッドオン',
    'Grid Off': 'グリッドオフ',
    'Reference Radius': '参照半径',
    'AI Randomizer': 'AIランダム生成',
    'Shuffle / Refresh': 'シャッフル/更新',
    'Reset on Shuffle': 'シャッフル時にリセット',
    'Reset View': 'ビューをリセット',
    'Tooltips': 'ツールチップ',
    'Language': '言語',
    'Cap Style': 'キャップスタイル',
    'Oscillation Enable': '振動を有効にする',
    'Sync All Planes': 'すべての平面を同期',
    'Bevel Amount': 'ベベル量',
    'Fillet Detail': 'フィレット詳細',
    'Mirror Offset': 'ミラーオフセット',
    'Mode': 'モード',
    'Underline': '下線',
    'Underline Thickness': '下線太さ',
    'Mirror Effect': 'ミラー効果',
    'Radius Lock': '半径ロック',
    'Radius Locked': '半径がロックされています',
    'Radius Unlocked': '半径がロック解除されています',
    'Inner Radius': '内半径',
    'Outer Radius': '外半径',
    'Diameter Mode': '直径モード',
    'Auto-fit': '自動フィット',
    'Fixed Size': '固定サイズ',
    'Boldness': '太字',
    'Letter Spacing': '文字間隔',
    'Manual Rotation': '手動回転',
    'Arms / Symmetry': 'アーム/対称',
    'Font Size': 'フォントサイズ',
    'Font Search': 'フォント検索',
    'Browse System Fonts': 'システムフォントを参照',
    'Requires Chrome/Edge': 'Chrome/Edgeが必要です',
    'System Fonts': 'システムフォント',
    'Upload Font': 'フォントアップロード',
    'Offset X': 'Xオフセット',
    'Offset Y': 'Yオフセット',
    'Phrase Content': 'フレーズ内容',
    'Primary': 'プライマリ',
    'Secondary': 'セカンダリ',
    'Fillet': 'フィレット',
    'Chamfer': 'チャンファー',
    'Active Plane Selector': 'アクティブ平面セレクター',
    'Rotation': '回転',
    'Amplitude': '振幅',
    'Frequency': '周波数',
    'Hub Sides': 'ハブ辺数',
    'Star Ratio': 'スターラシオ',
    'Hollow': '中空',
    'Visible': '表示',
    'Hidden': '非表示',
    'Wall Thickness': '壁厚',
    'Hub Shape': 'ハブ形状',
    'Hub Properties': 'ハブプロパティ',
    'Hub Radius': 'ハブ半径',
    'Export': 'エクスポート',
    'Shuffle': 'シャッフル',
    'Refresh': 'リフレッシュ',
    'Square': '四角',
    'Round': '丸',
    'Triangle': '三角',
    'None': 'なし',
    'Cap Length': 'キャップ長',
    'Underline Start': '下線開始',
    'Underline Length': '下線長',
    'Underline Mirror Offset': '下線ミラーオフセット',
    'Slot Length Adj': 'スロット長調整',
    'Slot Width Offset': 'スロット幅オフセット',
    'Slot Length': 'スロット長',
    'Slot Width': 'スロット幅',
    'Random Seed': 'ランダムシード',
    'Angle Variation': '角度変動',
    'Length Variation': '長さ変動',
    'Thickness Decay': '厚さ減衰',
    'Rounded Tips': '丸みのある先端',
    'Cut Slots': 'スロットカット',
    'Export STL': 'STLエクスポート',
    'Export All Planes': 'すべての平面をエクスポート',
    'Combined STL': '結合STL',
    'Zip All STLs': 'すべてのSTLを圧縮',
    'Auto-Configure Assembly Slots': '組み立てスロットの自動設定',
    'Export Resolution': 'エクスポート解像度',
    'Abstract Outer Radius': '抽象外半径',
    'Rot X': 'X回転',
    'Rot Y': 'Y回転',
    'Rot Z': 'Z回転',
    'Leave blank for AI Randomizer to choose a word': 'AIランダム生成器に単語を選択させる場合は空白のまま',
    'Search Fonts...': 'フォントを検索...',
    'Save My Project': 'プロジェクトを保存',
    'Save': '保存',
    'Load': '読み込み',
    'Add Shape': '形状を追加',
    '+ Shape': '+ 形状',
    'Shape': '形状',
    'Add Fractal': 'フラクタルを追加',
    '+ Fractal': '+ フラクタル',
    'Fractal': 'フラクタル',
    'Add Hub': 'ハブを追加',
    '+ Hub': '+ ハブ',
    'Delete Hub': 'ハブを削除',
    'Layer Name': 'レイヤー名',
    'Tree Arms': 'ツリーアーム',
    'Shape Arms': 'シェイプアーム',
    'Branching Structure': '分岐構造',
    'Trunk Length': '幹の長さ',
    'Branches Per Node': 'ノードあたりの枝数',
    'Recursion Depth': '再帰の深さ',
    'Min Branch Length': '最小枝長',
    'Branch Pattern': '枝パターン',
    'Branch Geometry': '枝ジオメトリ',
    'Branch Angle': '枝角度',
    'Branch Length': '枝長',
    'Initial Length': '初期長',
    'Length Decay': '長さの減衰',
    'Shape Settings': 'シェイプ設定',
    'Fractal Settings': 'フラクタル設定',
    'symmetric': '対称',
    'alternating': '交互',
    'random': 'ランダム',
    'line': 'ライン',
    'sine': 'サイン',
    'zigzag': 'ジグザグ',
    'All Planes': '全平面',
    'Selected Character': '選択文字',
    'circle': '円形',
    'polygon': '多角形',
    'star': '星形',
    'Chevron': 'シェブロン',
    'Outer Diameter': '外径',
    'Visible_desc': 'デザイン内のこの要素の表示/非表示を切り替えます。',
    'Hidden_desc': 'デザイン内のこの要素を非表示にします。',
    'Delete_desc': 'デザインからこの要素を削除します。',
    'Delete Hub_desc': '現在の平面からこのハブを削除します。',
    'Reset View_desc': 'ビューをリセットしてコンテンツに合わせます。',
    
    // Descriptions
    'Project Name_desc': 'デザインを保存またはエクスポートする際に使用されるファイル名。',
    'Model Color_desc': '3Dメッシュと2Dプレビューに適用されるベースカラー。',
    'Edge Profile_desc': 'よりリアルな見た目のために3Dモデルに丸みまたは斜めのエッジを追加します。',
    'Extrusion Depth_desc': '押し出し時の3Dモデルの厚さ。',
    'Global Boldness_desc': 'すべてのテキスト要素にストロークの太さを追加して大胆な外観にします。',
    'Preview Resolution_desc': '2Dプレビューレンダリングの品質レベル。',
    'AI Randomizer_desc': 'AIを使用してテキストに基づいたクリエイティブな雪の結晶デザインを生成します。',
    'Shuffle / Refresh_desc': 'メインテキスト/デザインを保持したままパラメータを再ランダム化します。',
    'Reset on Shuffle_desc': '最初から始めて完全に新しいモデルを生成します。',
    'Tooltips_desc': 'コントロールの上にカーソルを置いたときに役立つツールチップを表示します。',
    'Language_desc': 'インターフェース言語を選択します。',
    
    // Quality levels
    low: '低',
    med: '中',
    high: '高',
    
    // Common UI
    reset: 'リセット',
    cancel: 'キャンセル',
    save: '保存',
    settings: '設定',
    'Keyboard Shortcuts': 'キーボードショートカット',
    'Reset Defaults': 'デフォルトにリセット',
    'Save Changes': '変更を保存',
    'ON': 'オン',
    'OFF': 'オフ',
    
    // Shortcut actions
    switchToGlobalTab: 'グローバルタブに切り替え',
    switchToTextTab: 'テキストタブに切り替え',
    switchToLetterCtrlTab: '文字コントロールタブに切り替え',
    switchToHubsTab: 'ハブタブに切り替え',
    switchToAbstractTab: '抽象タブに切り替え',
    switchToPlanesTab: '平面タブに切り替え',
    toggleView: 'ビューを切り替え',
    forceRegenerate: '強制再生成',
    exportCombinedSTL: '結合STLをエクスポート',
    exportBasePlaneSTL: '基準平面STLをエクスポート',
    exportCrossPlaneSTL: '交差平面STLをエクスポート',
    exportTiltPlaneSTL: '傾斜平面STLをエクスポート',
    saveProject: 'プロジェクトを保存',
    loadProject: 'プロジェクトを読み込み',
    undo: '元に戻す',
    redo: 'やり直し',
    
    // Languages
    'English': 'English',
    'Español': 'Español',
    'Français': 'Français',
    'Deutsch': 'Deutsch',
    '中文': '中文',
    '日本語': '日本語',
    
    // Layer names
    'Base Plane': '基準平面',
    'Cross Plane': '交差平面',
    'Tilt Plane': '傾斜平面'
  }
};

// Translation hook
export const useTranslation = (language: string) => {
  const t = (key: string): string => {
    const lang = translations[language] || translations.en;
    return lang[key as keyof Translations] || key;
  };
  
  return { t };
};
