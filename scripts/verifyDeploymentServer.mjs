import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const artifactRoot = path.resolve(scriptDir, '..');
const indexPath = path.join(artifactRoot, 'frontend', 'dist', 'index.html');
if (!fs.existsSync(indexPath)) throw new Error('Deployment artifact is missing frontend/dist/index.html.');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyPasswordDependency() {
  const probe = 'deployment-artifact-self-test';
  const hash = await bcrypt.hash(probe, 4);
  assert(await bcrypt.compare(probe, hash), 'Production password hashing dependency is not operational.');
}

async function verifyHttpBoundaries(baseUrl, { mongoReady }) {
  const rootResponse = await fetch(`${baseUrl}/`);
  const rootHtml = await rootResponse.text();
  assert(rootResponse.status === 200, 'Production SPA root did not return 200.');
  assert(rootResponse.headers.get('content-type')?.includes('text/html'), 'Production SPA root is not HTML.');
  assert(rootHtml.includes('<div id="root"></div>'), 'Production SPA root is not the built frontend.');

  const entryAsset = rootHtml.match(/(?:src|href)="(\/assets\/[^\"]+)"/)?.[1];
  assert(entryAsset, 'Production SPA does not reference a built asset.');
  assert(
    fs.existsSync(path.join(artifactRoot, 'frontend', 'dist', entryAsset.slice(1))),
    'Referenced frontend asset is missing.',
  );

  const apiResponse = await fetch(`${baseUrl}/api/not-a-real-route`);
  const apiBody = await apiResponse.json();
  assert(
    [401, 404].includes(apiResponse.status) && typeof apiBody.error === 'string',
    'Unknown API route did not retain the JSON boundary.',
  );

  const legacyUploadResponse = await fetch(`${baseUrl}/uploads/not-a-public-file`);
  const legacyUploadBody = await legacyUploadResponse.text();
  assert(legacyUploadResponse.status === 404, 'Legacy public upload path unexpectedly resolved.');
  assert(!legacyUploadBody.includes('<div id="root"></div>'), 'Legacy upload path incorrectly fell through to the SPA.');

  const readinessResponse = await fetch(`${baseUrl}/health`);
  const readinessBody = await readinessResponse.json();
  assert(readinessResponse.status === (mongoReady ? 200 : 503), 'Readiness returned the wrong dependency status.');
  assert(
    JSON.stringify(readinessBody) === JSON.stringify({ ok: mongoReady, mongoReady }),
    'Readiness response exposed unexpected diagnostics.',
  );

  const livenessResponse = await fetch(`${baseUrl}/health/live`);
  const livenessBody = await livenessResponse.json();
  assert(livenessResponse.status === 200, 'Liveness did not return 200.');
  assert(JSON.stringify(livenessBody) === JSON.stringify({ ok: true }), 'Liveness response exposed unexpected diagnostics.');

  const inspectorResponse = await fetch(`${baseUrl}/__routes_full`);
  assert(!inspectorResponse.headers.get('content-type')?.includes('application/json'), 'Internal route inventory is exposed.');
}

async function verifyDisconnectedImport() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Disconnected deployment verification must run with NODE_ENV=test.');
  }

  const { default: app } = await import('../server.js');
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });

  try {
    const address = server.address();
    await verifyHttpBoundaries(`http://127.0.0.1:${address.port}`, { mongoReady: false });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForProductionServer(baseUrl, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Production artifact server exited before it became ready.');
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) return;
    } catch {
      // The listener starts only after MongoDB and declared indexes are ready.
    }
    await delay(250);
  }
  throw new Error('Production artifact server did not become ready in time.');
}

async function stopProductionServer(child, exitPromise) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  let exit = await Promise.race([exitPromise, delay(15_000).then(() => null)]);
  if (!exit) {
    child.kill('SIGKILL');
    exit = await exitPromise;
    throw new Error('Production artifact server did not shut down gracefully.');
  }
  return exit;
}

async function verifyProductionStartup() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Production deployment verification must run with NODE_ENV=production.');
  }
  if (!String(process.env.MONGODB_URI || '').startsWith('mongodb://')) {
    throw new Error('Production deployment verification requires a disposable MongoDB URL.');
  }

  const port = await reservePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: artifactRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  });
  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  let verificationError = null;
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForProductionServer(baseUrl, child);
    await verifyHttpBoundaries(baseUrl, { mongoReady: true });
  } catch (error) {
    verificationError = error;
  }

  const exit = await stopProductionServer(child, exitPromise);
  if (verificationError) throw verificationError;
  assert(exit.code === 0 && exit.signal === null, 'Production artifact server exited unsuccessfully.');
}

await verifyPasswordDependency();
if (process.env.NODE_ENV === 'production') {
  await verifyProductionStartup();
  console.log('Production-like deployment server verification passed.');
} else {
  await verifyDisconnectedImport();
  console.log('Standalone deployment server verification passed.');
}
