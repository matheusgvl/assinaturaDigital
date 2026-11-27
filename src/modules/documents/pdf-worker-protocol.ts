/** Tamanho e formato do canal binário privado entre a API e o processo de PDF. */
export const PDF_IMAGE = 'assinatura-pdf-worker:local';
export const PDF_LIMIT = 20 * 1024 * 1024;
export const PDF_OUTPUT_LIMIT = PDF_LIMIT + 4 * 1024 * 1024;
export const PDF_HEADER_LIMIT = 4096;
export const P12_LIMIT = 64 * 1024;
export const PDF_JOB_TIMEOUT_MS = 12000;

export type SignPdfJob = {
  operation: 'sign';
  p12Length: number;
  signerName: string;
  page: number;
  x: number;
  y: number;
  signatureId: string;
  documentHash: string;
  signedAt: string;
};

export type PdfJob = SignPdfJob | { operation: 'inspect' };
