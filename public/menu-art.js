'use strict';

for (const [job, team] of [['warrior', '紅隊'], ['archer', '藍隊'], ['mage', '藍隊']]) {
  const canvas = $('menu-' + job);
  const ctx = canvas.getContext('2d');
  const id = { warrior: 'sky', archer: 'sain', mage: 'gamma' }[job];
  if (campaignSprites) {
    const render = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      drawHeroPixels(ctx, id, 2, 1, 48, 50);
      ctx.restore();
    };
    if (campaignSprites.complete) queueMicrotask(render);
    else campaignSprites.addEventListener('load', render, { once: true });
  }
  ctx.translate(20, 46);
  const color = colors[team];
  armor(ctx, job, color, 0, 0, false);
  weapon(ctx, { job, facing: 0 }, color, 0);
}

// Pixel silhouettes stay sharp at any panel size.
function paintPixelArt(ctx, x, y, size, palette, rows) {
  for (const [row, pixels] of rows.entries()) {
    for (const [col, pixel] of [...pixels].entries()) {
      if (palette[pixel]) rect(ctx, palette[pixel], x + col * size, y + row * size, size, size);
    }
  }
}

const mysteryArt = $('menu-mystery-art').getContext('2d');
paintPixelArt(mysteryArt, 46, 0, 4, { O: '#162e35', B: '#d9f9c1', Q: '#347365' }, [
  '.OOOOOOOOO.',
  'OBBBBBBBBBO',
  'OBBBQQQBBBO',
  'OBBBBBQBBBO',
  'OBBBBQBBBBO',
  'OBBBBQBBBBO',
  'OBBBBBBBBBO',
  'OBBBBQBBBBO',
  '.OOOBBOOOO.',
  '...OBO.....',
  '...OO......'
]);
paintPixelArt(mysteryArt, 0, 30, 6, { O: '#132e32', S: '#367b5a', L: '#68a76f', H: '#a8d982', E: '#182f2d' }, [
  '....OOOO.......',
  '..OOLLLLO......',
  '.OSLLHLLLO..OO.',
  '.OSLHHLSLO.OHHO',
  'OSLLHSLLLSOHHEO',
  'OSLLLSSSLLOHHHO',
  'OSSSSSSSSSSHHO.',
  '.OHHHHHHHHHOO..',
  '..OSO..OSOO....',
  '..OO...OO......'
]);
const menuAvatar = $('menu-avatar').getContext('2d');
paintPixelArt(menuAvatar, 0, 0, 2, { O: '#301f3e', L: '#a793ca', S: '#72608e', H: '#e2d5f4' }, [
  '................',
  '.....OOOOOO.....',
  '....OLHHHLLO....',
  '....OLLLLLLO....',
  '....OLLOOLLO....',
  '....OLLSSLLO....',
  '.....OLLLLO.....',
  '....OOSSSSOO....',
  '...OLLLLLLLLO...',
  '..OLLHHLLHHOO...',
  '..OLLLLLLLLSO...',
  '..OSSSSSSSSOO...',
  '...OOOOOOOOO....'
]);

previewMap.then(map => {
  if (!map) return;
  drawMapPreview($('home-map'), map, .5, .52);
  drawMapPreview($('modes-map'), map, .32, .43);
  drawMapPreview($('room-entry-map'), map, .64, .55);
  drawMapPreview($('soup-map'), map, .38, .42);
  const canvas = $('menu-arena-map');
  drawMapPreview(canvas, map, 0.31, 0.74);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width * 0.74, canvas.height * 0.83);
  ctx.scale(3, 3);
  drawChest(ctx, { x: 0, y: 0, quality: 'legendary', openedAt: null }, 0);
  ctx.restore();
});
