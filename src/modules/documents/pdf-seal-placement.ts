import { PDFName, PDFNumber, type PDFPage } from 'pdf-lib';

export const SEAL_WIDTH = 180;
export const SEAL_HEIGHT = 60;

/** Converte pontos da parte visível da página para o espaço nativo do PDF. */
export function resolveSealPlacement(page: PDFPage, x: number, y: number) {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const left = Math.max(media.x, crop.x);
  const bottom = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  const box = right > left && top > bottom
    ? { x: left, y: bottom, width: right - left, height: top - bottom }
    : media;
  const angle = page.getRotation().angle;
  const rotation = ((angle % 360) + 360) % 360;
  const unit = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber() ?? 1;
  const quarterTurn = rotation === 90 || rotation === 270;
  const [width, height] = quarterTurn ? [box.height, box.width] : [box.width, box.height];
  if (
    ![0, 90, 180, 270].includes(rotation) ||
    ![x, y, width, height, box.x, box.y, unit].every(Number.isFinite) ||
    unit <= 0 || x < 0 || y < 0 ||
    x + SEAL_WIDTH > width * unit || y + SEAL_HEIGHT > height * unit
  ) {
    throw new Error('seal out of range');
  }

  function point(offsetX: number, offsetY: number) {
    const u = (x + offsetX) / unit;
    const v = (y + offsetY) / unit;
    switch (rotation) {
      case 90: return { x: box.x + box.width - v, y: box.y + u };
      case 180: return { x: box.x + box.width - u, y: box.y + box.height - v };
      case 270: return { x: box.x + v, y: box.y + box.height - u };
      default: return { x: box.x + u, y: box.y + v };
    }
  }
  return { point, rotation, unit };
}
