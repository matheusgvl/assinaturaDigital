async (page) => {
  const base = new URL(page.url()).origin;
  const pdf = 'test/fixtures/browser-sample.pdf';
  const output = 'output/playwright/webauthn-signed.pdf';
  const email = `passkey-${Date.now()}@example.test`;
  const password = [crypto.randomUUID(), 'aA0!'].join('-');
  const steps = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal',
      hasResidentKey: true, hasUserVerification: true, isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const url = path => base + path;
  const waitApi = path => page.waitForResponse(r => r.url().endsWith(path) && r.request().method() === 'POST');
  const verify = (condition, message) => { if (!condition) throw new Error(message); };
  const formButton = name => page.getByRole('button', { name, exact: true });
  const waitText = text => page.getByText(text, { exact: true }).waitFor();
  try {
    await page.context().clearCookies();
    await page.goto(url('/register'));
    await page.getByLabel('Nome completo').fill('Conta de teste WebAuthn');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('Confirmar senha', { exact: true }).fill(password);
    await formButton('Criar conta').click();
    await page.getByText('Cadastro concluído.', { exact: false }).waitFor();
    await page.goto(url('/login'));
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await formButton('Entrar').click();
    await page.waitForURL('**/dashboard');
    steps.push('cadastro e login por senha');

    await page.getByRole('link', { name: 'Dispositivos', exact: true }).click();
    await page.getByLabel('Senha atual', { exact: true }).fill(password);
    const registration = waitApi('/auth/passkeys/registration/verify');
    await formButton('Registrar passkey').click();
    verify((await registration).status() === 200, 'A verificação do cadastro falhou');
    await waitText('Passkey registrada.');
    const item = page.getByRole('listitem').filter({ hasText: 'Passkey' });
    await item.getByRole('button', { name: 'Renomear', exact: true }).click();
    await item.getByLabel('Nome do dispositivo').fill('Chromium virtual');
    await item.getByLabel('Confirme sua senha').fill(password);
    await item.getByRole('button', { name: 'Salvar nome' }).click();
    await waitText('Chromium virtual');
    steps.push('registro com autenticador virtual, listagem e renomeação');

    await formButton('Sair').click();
    await page.waitForURL('**/login');
    await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: false });
    await formButton('Entrar com passkey').click();
    await formButton('Cancelar').click();
    await waitText('A autenticação foi cancelada ou não foi permitida pelo autenticador.');
    await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled: true });
    steps.push('cancelamento no navegador');
    await cdp.send('WebAuthn.setResponseOverrideBits', { authenticatorId, isBogusSignature: true });
    const badSignature = waitApi('/auth/passkeys/authentication/verify');
    await formButton('Entrar com passkey').click();
    const refused = await badSignature;
    verify(refused.status() === 401 && !(await refused.headerValue('set-cookie')), 'Assinatura inválida aceita');
    await waitText('Não foi possível autenticar com a passkey.');
    await cdp.send('WebAuthn.setResponseOverrideBits', { authenticatorId, isBogusSignature: false });
    steps.push('assinatura inválida recusada');
    const authentication = waitApi('/auth/passkeys/authentication/verify');
    await formButton('Entrar com passkey').click();
    const response = await authentication;
    verify(response.status() === 200, 'A assinatura da resposta WebAuthn não foi aceita');
    verify(typeof (await response.json()).accessToken === 'string', 'Sessão WebAuthn ausente');
    await formButton('Sair').waitFor();
    steps.push('login por passkey e abertura de sessão');

    await page.getByRole('link', { name: 'Assinar documento', exact: false }).first().click();
    await page.locator('#pdf-file').setInputFiles(pdf);
    await page.getByRole('img', { name: 'Prévia da página 1 do documento' }).click();
    await formButton('Assinar documento').click();
    await waitText('Documento assinado pelo servidor.');
    const [download] = await Promise.all([
      page.waitForEvent('download'), formButton('Baixar PDF assinado').click(),
    ]);
    await download.saveAs(output);
    await page.goto(url('/verify'));
    await page.locator('#pdf-file').setInputFiles(output);
    await formButton('Verificar documento').click();
    await waitText('Documento íntegro.');
    steps.push('assinatura, download e verificação pública do PDF');

    await page.goto(url('/security/totp'));
    await formButton('Começar configuração').click();
    const qr = page.getByRole('img', { name: /QR Code/ });
    await qr.waitFor();
    await page.addScriptTag({ path: 'output/playwright/node_modules/jsqr/dist/jsQR.js' });
    const totpSecret = await qr.evaluate(async (image) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      return new URL(window.jsQR(data, width, height).data).searchParams.get('secret');
    });
    const totpCode = () => page.evaluate(async (secret) => {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      const bits = Array.from(secret, char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
      const key = Uint8Array.from(bits.match(/.{8}/g), byte => Number.parseInt(byte, 2));
      const counter = new DataView(new ArrayBuffer(8));
      counter.setBigUint64(0, BigInt(Math.floor(Date.now() / 30000)));
      const hmac = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const digest = new DataView(await crypto.subtle.sign('HMAC', hmac, counter.buffer));
      const start = digest.getUint8(digest.byteLength - 1) & 15;
      return String((digest.getUint32(start) & 0x7fffffff) % 1000000).padStart(6, '0');
    }, totpSecret);
    await page.getByLabel('Código de seis dígitos').fill(await totpCode());
    await formButton('Confirmar ativação').click();
    await page.getByRole('heading', { name: 'Códigos de recuperação' }).waitFor();
    await formButton('Sair').click();
    await page.waitForURL('**/login');
    const afterActivation = waitApi('/auth/passkeys/authentication/verify');
    await formButton('Entrar com passkey').click();
    const challengeResponse = await afterActivation;
    const challenge = await challengeResponse.json();
    verify(challengeResponse.status() === 200 && challenge.requiresSecondFactor === true &&
      !challenge.accessToken && !(await challengeResponse.headerValue('set-cookie')),
      'A passkey emitiu credenciais antes do TOTP');
    await page.waitForURL('**/login/totp');
    await page.getByLabel('Código TOTP').fill(await totpCode());
    await formButton('Confirmar código').click();
    await formButton('Sair').waitFor();
    steps.push('passkey com TOTP obrigatório antes do JWT e do cookie');

    await page.goto(url('/passkeys'));
    const device = page.getByRole('listitem').filter({ hasText: 'Chromium virtual' });
    await device.getByRole('button', { name: 'Revogar', exact: true }).click();
    await device.getByLabel('Confirme sua senha').fill(password);
    await device.getByRole('button', { name: 'Revogar', exact: true }).click();
    await waitText('Nenhuma passkey registrada');
    await formButton('Sair').click();
    await page.waitForURL('**/login');
    const rejected = waitApi('/auth/passkeys/authentication/verify');
    await formButton('Entrar com passkey').click();
    verify((await rejected).status() === 401, 'O servidor aceitou uma credencial revogada');
    await waitText('Não foi possível autenticar com a passkey.');
    steps.push('revogação confirmada e credencial revogada recusada');
    return steps;
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
    await cdp.detach();
  }
}
