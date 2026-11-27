import {
  PDFArray, PDFDict, PDFDocument, PDFInvalidObject, PDFName, PDFRef, PDFStream,
  type PDFObject,
} from 'pdf-lib';

const FORBIDDEN_ENTRIES = new Set([
  'JS', 'JavaScript', 'AA', 'OpenAction', 'XFA', 'RichMediaContent', 'EmbeddedFiles',
]);
const FORBIDDEN_ACTIONS = new Set([
  'JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'GoToR', 'GoToE',
  'Sound', 'Movie', 'Rendition', 'RichMediaExecute',
]);

function rejected(): never {
  throw new Error('PDF structure is not accepted');
}

/** Valida objetos já decodificados pelo parser no container, sem executar ações. */
export async function loadPassivePdf(bytes: Buffer): Promise<PDFDocument> {
  const document = await PDFDocument.load(bytes, {
    throwOnInvalidObject: true, updateMetadata: false,
  });
  const context = document.context;
  const remaining: PDFObject[] = context.enumerateIndirectObjects().map(([, object]) => object);
  const visited = new Set<PDFObject>();

  while (remaining.length > 0) {
    const object = remaining.pop()!;
    if (visited.has(object)) continue;
    visited.add(object);
    if (object instanceof PDFInvalidObject) rejected();
    if (object instanceof PDFStream) remaining.push(object.dict);
    if (object instanceof PDFRef && !context.lookup(object)) rejected();
    if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index += 1) remaining.push(object.get(index));
    }
    if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        const name = key.decodeText();
        if (FORBIDDEN_ENTRIES.has(name)) rejected();
        if (name === 'S') {
          const subtype = context.lookup(value);
          if (subtype instanceof PDFName && FORBIDDEN_ACTIONS.has(subtype.decodeText())) rejected();
        }
        remaining.push(value);
      }
    }
  }
  if (document.getPageCount() === 0) rejected();
  return document;
}
