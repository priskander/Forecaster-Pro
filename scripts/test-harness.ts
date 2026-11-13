import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

export interface IsolatedServerHandle {
  baseUrl: string;
  port: number;
  dbFile: string;
  dataDir: string;
  stdout: string[];
  stderr: string[];
  stop: (cleanupDb?: boolean) => Promise<void>;
}

export interface IsolatedServerOptions {
  dbFile?: string;
  dataDir?: string;
  env?: Record<string, string | undefined>;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (!address || typeof address === 'string') {
        srv.close(() => reject(new Error('Could not allocate free port')));
        return;
      }
      const port = address.port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

export async function startIsolatedTestServer(options: IsolatedServerOptions = {}): Promise<IsolatedServerHandle> {
  const port = await getFreePort();
  const suffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const dataDir = options.dataDir || path.join(os.tmpdir(), `forecaster_test_${suffix}`);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbFile = options.dbFile || path.join(dataDir, 'isolated-test-db.json');

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  // Default isolated environment prevents inheriting production settings
  delete childEnv.ALLOWED_ORIGINS;
  delete childEnv.APP_URL;
  delete childEnv.INITIAL_ADMIN_EMAIL;
  delete childEnv.INITIAL_ADMIN_PASSWORD;
  childEnv.NODE_ENV = 'development';
  childEnv.DISABLE_HMR = 'true';
  childEnv.PORT = String(port);
  childEnv.HOST = '127.0.0.1';
  childEnv.DATA_DIR = dataDir;
  childEnv.DB_FILE = dbFile;

  if (options.env) {
    for (const [k, v] of Object.entries(options.env)) {
      if (v === undefined) {
        delete childEnv[k];
      } else {
        childEnv[k] = v;
      }
    }
  }

  const tsxBin = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
  const child: ChildProcess = spawn(
    process.execPath,
    [tsxBin, 'server.ts', '--port', String(port), '--host', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout?.on('data', (chunk) => stdout.push(String(chunk)));
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  let exitedEarly = false;
  let exitCode: number | null = null;
  child.once('exit', (code) => {
    exitedEarly = true;
    exitCode = code;
  });

  const startTime = Date.now();
  const timeoutMs = 20000;
  let ready = false;

  while (Date.now() - startTime < timeoutMs) {
    if (exitedEarly) {
      throw new Error(`Isolated test server exited early with code ${exitCode}.\nStderr: ${stderr.join('')}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/cloud-sync/status`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // Waiting for listener
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!ready) {
    try {
      child.kill('SIGKILL');
    } catch {}
    throw new Error(`Isolated test server failed to respond within ${timeoutMs}ms.\nStdout: ${stdout.join('')}\nStderr: ${stderr.join('')}`);
  }

  const stop = async (cleanupDb = true) => {
    if (!exitedEarly) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
          resolve();
        }, 2500);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        try {
          child.kill('SIGTERM');
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    }

    if (cleanupDb) {
      try {
        if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
        if (fs.existsSync(`${dbFile}.tmp`)) fs.unlinkSync(`${dbFile}.tmp`);
        if (!options.dataDir && fs.existsSync(dataDir)) {
          fs.rmSync(dataDir, { recursive: true, force: true });
        }
      } catch {}
    }
  };

  return { baseUrl, port, dbFile, dataDir, stdout, stderr, stop };
}
