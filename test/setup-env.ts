import { generateKeyPairSync } from 'node:crypto';

const originalPort = process.env.PORT;
const originalPdfMasterKey = process.env.PDF_MASTER_KEY_B64;
const originalJwtPrivateKey = process.env.JWT_PRIVATE_KEY_B64;
const originalJwtPublicKey = process.env.JWT_PUBLIC_KEY_B64;

if (typeof originalPort === 'undefined') {
  process.env.PORT = '3000';
}

if (typeof process.env.PDF_MASTER_KEY_B64 === 'undefined') {
  process.env.PDF_MASTER_KEY_B64 = Buffer.alloc(32, 7).toString('base64');
}

if (
  typeof process.env.JWT_PRIVATE_KEY_B64 === 'undefined' ||
  typeof process.env.JWT_PUBLIC_KEY_B64 === 'undefined'
) {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  if (typeof process.env.JWT_PRIVATE_KEY_B64 === 'undefined') {
    process.env.JWT_PRIVATE_KEY_B64 = Buffer.from(
      keys.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    ).toString('base64');
  }
  if (typeof process.env.JWT_PUBLIC_KEY_B64 === 'undefined') {
    process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(
      keys.publicKey.export({ format: 'pem', type: 'spki' }),
    ).toString('base64');
  }
}

afterAll(() => {
  if (typeof originalPort === 'undefined') {
    delete process.env.PORT;
  } else {
    process.env.PORT = originalPort;
  }

  if (originalPdfMasterKey === undefined) {
    delete process.env.PDF_MASTER_KEY_B64;
  } else {
    process.env.PDF_MASTER_KEY_B64 = originalPdfMasterKey;
  }

  if (originalJwtPrivateKey === undefined) {
    delete process.env.JWT_PRIVATE_KEY_B64;
  } else {
    process.env.JWT_PRIVATE_KEY_B64 = originalJwtPrivateKey;
  }
  if (originalJwtPublicKey === undefined) {
    delete process.env.JWT_PUBLIC_KEY_B64;
  } else {
    process.env.JWT_PUBLIC_KEY_B64 = originalJwtPublicKey;
  }
});
