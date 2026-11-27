import { Injectable } from '@nestjs/common';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import signpdf from '@signpdf/signpdf';
import forge from 'node-forge';
import { createHash } from 'node:crypto';
import { resolveSealPlacement, SEAL_HEIGHT, SEAL_WIDTH } from './pdf-seal-placement';

export type PdfSignatureInspection = {
  present: boolean;
  valid: boolean;
  signer?: string;
  signedAt?: string;
};

const BYTE_RANGE = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/;
const CONTENTS = /\/Contents\s*<([0-9a-fA-F\s]+)>/;

type ForgeAttribute = {
  value: [{ value: string }, { value: Array<{ value: string }> }];
};
type ForgeCertificate = {
  subject?: { attributes?: Array<{ name?: string; shortName?: string; value?: unknown }> };
  publicKey: { verify: (digest: string, signature: string) => boolean };
};

function subjectName(certificate: ForgeCertificate): string | undefined {
  const attribute = certificate?.subject?.attributes?.find(
    (item) => item.name === 'commonName' || item.shortName === 'CN',
  );
  return typeof attribute?.value === 'string' ? attribute.value : undefined;
}

function signatureTimestamp(attributes: ForgeAttribute[]): string | undefined {
  const signingTimeOid = forge.pki.oids.signingTime;
  const attribute = attributes.find(
    (item) => forge.asn1.derToOid(item.value[0].value) === signingTimeOid,
  );
  const value = attribute?.value?.[1]?.value?.[0]?.value;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(`20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}T${value.slice(6, 8)}:${value.slice(8, 10)}:${value.slice(10, 12)}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

@Injectable()
export class PdfSignatureService {
  async sign(
    original: Buffer,
    p12: Buffer,
    signerName: string,
    pageNumber: number,
    x: number,
    y: number,
    signatureId: string,
    documentHash: string,
    signedAt: Date,
  ): Promise<Buffer> {
    const document = await PDFDocument.load(original, { updateMetadata: false });
    const pages = document.getPages();
    const page = pages[pageNumber - 1];
    if (!page) throw new Error('page out of range');
    const { point, rotation, unit } = resolveSealPlacement(page, x, y);
    const rotate = degrees(rotation);
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawRectangle({
      ...point(0, 0),
      width: SEAL_WIDTH / unit,
      height: SEAL_HEIGHT / unit,
      rotate,
      color: rgb(0.93, 0.96, 1),
      borderColor: rgb(0.12, 0.25, 0.45),
      borderWidth: 1 / unit,
      opacity: 0.94,
    });

    const charset = new Set(font.getCharacterSet());
    const label = Array.from(`Assinado por ${signerName.normalize('NFC')}`, (char) =>
      charset.has(char.codePointAt(0)!) ? char : '?',
    ).join('');
    let title = label;
    while (font.widthOfTextAtSize(title, 8) > SEAL_WIDTH - 16) {
      title = `${title.slice(0, title === label ? -1 : -2)}…`;
    }
    const lines = [
      [title, 47, 8],
      [signedAt.toISOString(), 36, 5.5],
      [`SHA-256: ${documentHash.slice(0, 32)}`, 25, 5.5],
      [documentHash.slice(32), 16, 5.5],
      [`ID: ${signatureId}`, 7, 5.5],
    ] as const;
    for (const [value, offset, size] of lines) {
      page.drawText(value, {
        ...point(8, offset),
        size: size / unit,
        rotate,
        font,
        color: rgb(0.05, 0.1, 0.2),
      });
    }

    pdflibAddPlaceholder({
      pdfDoc: document,
      reason: 'Assinatura digital',
      contactInfo: 'assinaturaDigital',
      name: signerName.slice(0, 64),
      location: 'Brasil',
      signingTime: signedAt,
      signatureLength: 16_000,
      appName: 'Assinatura Digital',
    });
    const prepared = Buffer.from(await document.save({ useObjectStreams: false }));
    return signpdf.sign(prepared, new P12Signer(p12), signedAt);
  }

  inspect(pdf: Buffer): PdfSignatureInspection {
    const text = pdf.toString('latin1');
    const byteRange = text.match(BYTE_RANGE);
    const contents = text.match(CONTENTS);
    if (!byteRange || !contents) return { present: false, valid: false };

    try {
      const ranges = byteRange.slice(1).map(Number);
      if (
        ranges[0] !== 0 ||
        ranges[1] <= 0 ||
        ranges[2] <= ranges[1] ||
        ranges[3] <= 0 ||
        ranges[2] + ranges[3] !== pdf.length
      ) return { present: true, valid: false };
      const signedBytes = Buffer.concat([
        pdf.subarray(ranges[0], ranges[0] + ranges[1]),
        pdf.subarray(ranges[2], ranges[2] + ranges[3]),
      ]);
      const signatureHex = contents[1].replace(/\s/g, '').replace(/(?:00)+$/i, '');
      const cms = forge.pkcs7.messageFromAsn1(
        forge.asn1.fromDer(Buffer.from(signatureHex, 'hex').toString('binary')),
      );
      const capture = cms.rawCapture as {
        authenticatedAttributes?: ForgeAttribute[];
        signature?: string;
      };
      const certificate = cms.certificates?.[0] as ForgeCertificate | undefined;
      const signatureAttributes = capture.authenticatedAttributes;
      const signature = capture.signature;
      if (!certificate || !signatureAttributes || !signature) return { present: true, valid: false };
      const messageDigestAttribute = signatureAttributes.find(
        (item) => forge.asn1.derToOid(item.value[0].value) === forge.pki.oids.messageDigest,
      );
      const expectedDigest = messageDigestAttribute?.value?.[1]?.value?.[0]?.value;
      const actualDigest = createHash('sha256').update(signedBytes).digest();
      if (!expectedDigest || !actualDigest.equals(Buffer.from(expectedDigest, 'latin1'))) {
        return { present: true, valid: false };
      }
      const attributes = forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.SET,
        true,
        signatureAttributes,
      );
      const attributeDigest = forge.md.sha256.create();
      attributeDigest.update(forge.asn1.toDer(attributes).getBytes());
      const valid = certificate.publicKey.verify(
        attributeDigest.digest().bytes(),
        signature,
      );
      return {
        present: true,
        valid,
        signer: subjectName(certificate),
        signedAt: signatureTimestamp(signatureAttributes),
      };
    } catch {
      return { present: true, valid: false };
    }
  }
}
