import { execFileSync } from 'node:child_process';
import { PDF_ISOLATION_ARGS } from '../src/modules/documents/pdf-sandbox.service';
import { PDF_IMAGE } from '../src/modules/documents/pdf-worker-protocol';

describe('PDF worker isolation on Linux Docker', () => {
  it('enforces the filesystem, identity, network and resource limits inside the container', () => {
    const probe = `
      const fs = require('node:fs');
      const os = require('node:os');
      const assert = require('node:assert/strict');
      const proc = fs.readFileSync('/proc/self/status', 'utf8');
      assert.equal(process.getuid(), 10001);
      assert.match(proc, /^NoNewPrivs:\\s+1$/m);
      assert.match(proc, /^CapEff:\\s+0+$/m);
      assert.ok(Object.values(os.networkInterfaces()).flat().every(address => address.internal));
      assert.throws(() => fs.writeFileSync('/worker/probe', 'data'), { code: 'EROFS' });
      assert.throws(() => fs.statSync('/var/run/docker.sock'), { code: 'ENOENT' });
      assert.equal(process.env.PDF_MASTER_KEY_B64, undefined);
      assert.equal(process.env.JWT_PRIVATE_KEY_B64, undefined);
      assert.equal(fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(), '402653184');
      assert.equal(fs.readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(), '32');
      const [quota, period] = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim().split(' ').map(Number);
      assert.equal(quota / period, 1);
      console.log('sandbox checks passed');
    `;
    const result = execFileSync('docker', [
      'run', '--rm', ...PDF_ISOLATION_ARGS, '--entrypoint=node', PDF_IMAGE, '-e', probe,
    ], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    expect(result.trim()).toBe('sandbox checks passed');
  }, 20000);
});
