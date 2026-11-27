import { degrees, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import { resolveSealPlacement } from './pdf-seal-placement';

describe('seal placement', () => {
  it.each([
    [0, { x: 30, y: 50 }, { x: 210, y: 110 }],
    [90, { x: 280, y: 40 }, { x: 220, y: 220 }],
    [180, { x: 290, y: 530 }, { x: 110, y: 470 }],
    [270, { x: 40, y: 540 }, { x: 100, y: 360 }],
  ])('maps crop box points at %i degrees', async (angle, first, last) => {
    const document = await PDFDocument.create();
    const page = document.addPage([400, 600]);
    page.setCropBox(10, 20, 300, 540);
    page.setRotation(degrees(angle));
    const placement = resolveSealPlacement(page, 20, 30);
    expect(placement.point(0, 0)).toEqual(first);
    expect(placement.point(180, 60)).toEqual(last);
  });

  it('scales the visible coordinates by UserUnit and rejects invalid bounds', async () => {
    const page = (await PDFDocument.create()).addPage([400, 500]);
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    expect(resolveSealPlacement(page, 40, 80).point(0, 0)).toEqual({ x: 20, y: 40 });
    for (const [x, y] of [[-1, 0], [NaN, 0], [0, Infinity], [621, 0], [0, 941]]) {
      expect(() => resolveSealPlacement(page, x, y)).toThrow('seal out of range');
    }
  });
});
