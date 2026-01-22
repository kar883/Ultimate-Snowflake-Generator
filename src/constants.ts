import { FontOption } from './types';

export const CURSIVE_FONTS: FontOption[] = [
  { name: 'Great Vibes', family: 'Great Vibes' },
  { name: 'Alex Brush', family: 'Alex Brush' },
  { name: 'Allura', family: 'Allura' },
  { name: 'Dancing Script', family: 'Dancing Script' },
  { name: 'Pacifico', family: 'Pacifico' },
  { name: 'Parisienne', family: 'Parisienne' },
  { name: 'Satisfy', family: 'Satisfy' },
  { name: 'Pinyon Script', family: 'Pinyon Script' },
  { name: 'Rouge Script', family: 'Rouge Script' },
  { name: 'Yellowtail', family: 'Yellowtail' },
  { name: 'Cookie', family: 'Cookie' },
  { name: 'Petit Formal Script', family: 'Petit Formal Script' },
  { name: 'Meie Script', family: 'Meie Script' },
  { name: 'Grand Hotel', family: 'Grand Hotel' },
  { name: 'Rochester', family: 'Rochester' },
  { name: 'Sacramento', family: 'Sacramento' },
  { name: 'Windsong', family: 'Windsong' },
];

export const FONT_TTF_URLS: Record<string, string> = {
  'Alex Brush': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/alexbrush/AlexBrush-Regular.ttf',
  'Allura': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/allura/Allura-Regular.ttf',
  // Dancing Script is a variable font now and does not have a static folder in the root of the source
  'Dancing Script': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf',
  'Great Vibes': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/greatvibes/GreatVibes-Regular.ttf',
  'Pacifico': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/pacifico/Pacifico-Regular.ttf',
  'Parisienne': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/parisienne/Parisienne-Regular.ttf',
  'Satisfy': 'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/satisfy/Satisfy-Regular.ttf',
  'Pinyon Script': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/pinyonscript/PinyonScript-Regular.ttf',
  'Rouge Script': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/rougescript/RougeScript-Regular.ttf',
  'Yellowtail': 'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/yellowtail/Yellowtail-Regular.ttf',
  'Cookie': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cookie/Cookie-Regular.ttf',
  'Petit Formal Script': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/petitformalscript/PetitFormalScript-Regular.ttf',
  'Meie Script': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/meiescript/MeieScript-Regular.ttf',
  'Grand Hotel': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/grandhotel/GrandHotel-Regular.ttf',
  'Rochester': 'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/rochester/Rochester-Regular.ttf',
  'Sacramento': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sacramento/Sacramento-Regular.ttf',
  'Windsong': 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/windsong/WindSong-Regular.ttf',
};

export const MM_TO_PX = 3.7795275591;
