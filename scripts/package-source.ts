/**
 * Forecaster Pro Safe Source Archive Builder & Verifier
 *
 * Builds distributable .zip and .tar.gz source archives while strictly excluding
 * runtime databases, snapshots, backups, session stores, private .env files,
 * keys, build artifacts, and generated archives — then verifies every archive
 * entry on disk before declaring packaging successful.
 */

import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

export type ArchiveFormat = 'zip' | 'tar' | 'both';

const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'data',
  'backups',
  'exports',
  'tmp',
  'temp',
  'dist',
  'build',
  'coverage',
  '.git',
  '.aistudio'
]);

const EXCLUDED_EXACT_BASENAMES = new Set([
  '.ds_store',
  '.env',
  'cloud-ledger-db.json',
  'forecaster-pro-source.zip',
  'forecaster-pro-source.tar.gz'
]);

const FORBIDDEN_EXTENSIONS_RE = /\.(db|sqlite|sqlite3|bak|backup|dump|sql\.gz|tmp|secret|zip|tar\.gz|tgz|pem|key|p12|pfx)$/i;

export function normalizeArchiveRelPath(relPath: string): string {
  return relPath
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
}

export function isForbiddenArchivePath(relPath: string): boolean {
  const clean = normalizeArchiveRelPath(relPath);
  if (!clean) return false;
  const lower = clean.toLowerCase();
  const segments = lower.split('/').filter(Boolean);
  if (segments.length === 0) return false;

  for (const seg of segments) {
    if (EXCLUDED_DIR_NAMES.has(seg)) {
      return true;
    }
    if (seg === 'session-store' || seg.startsWith('session-store')) {
      return true;
    }
  }

  const base = segments[segments.length - 1];
  if (EXCLUDED_EXACT_BASENAMES.has(base)) {
    return true;
  }

  // Private .env* files are strictly forbidden, EXCEPT .env.example template
  if ((base === '.env' || base.startsWith('.env.')) && base !== '.env.example') {
    return true;
  }

  // Generated archive naming variants
  if (/^forecaster-pro-source.*\.(zip|tar\.gz|tgz)$/i.test(base)) {
    return true;
  }

  // Database filenames & session stores anywhere in tree
  if (base.includes('cloud-ledger-db')) {
    return true;
  }
  if (/^.*session[-_]?store.*\.(json|db|sqlite|bak|tmp)$/i.test(base)) {
    return true;
  }

  if (FORBIDDEN_EXTENSIONS_RE.test(lower)) {
    return true;
  }

  return false;
}

export function collectSafeSourceFiles(sourceDir: string): string[] {
  const root = path.resolve(sourceDir);
  const collected: string[] = [];

  function walk(currentDir: string, relPrefix: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (isForbiddenArchivePath(rel)) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, rel);
      } else if (entry.isFile()) {
        collected.push(normalizeArchiveRelPath(rel));
      }
    }
  }

  walk(root, '');
  return collected;
}

// IEEE 802.3 CRC-32 table for standard ZIP archives
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(mtime: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, mtime.getFullYear());
  const month = mtime.getMonth() + 1;
  const day = mtime.getDate();
  const hours = mtime.getHours();
  const minutes = mtime.getMinutes();
  const seconds = Math.floor(mtime.getSeconds() / 2);
  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

export function writeZipArchive(sourceDir: string, relFiles: string[], outputZipPath: string): void {
  const root = path.resolve(sourceDir);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const relRaw of relFiles) {
    const rel = normalizeArchiveRelPath(relRaw);
    const fullPath = path.join(root, rel);
    const stat = fs.statSync(fullPath);
    const rawData = fs.readFileSync(fullPath);
    const compressedData = rawData.length > 0 ? zlib.deflateRawSync(rawData) : rawData;
    const useDeflate = rawData.length > 0 && compressedData.length < rawData.length;
    const payload = useDeflate ? compressedData : rawData;
    const method = useDeflate ? 8 : 0;
    const checksum = crc32(rawData);
    const { dosTime, dosDate } = toDosDateTime(stat.mtime);
    const nameBuf = Buffer.from(rel, 'utf-8');
    const utf8Flag = 0x0800;

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // Version needed: 2.0
    localHeader.writeUInt16LE(utf8Flag, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // Unix + v2.0
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(utf8Flag, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(((stat.mode & 0o777) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset >>> 0, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(relFiles.length, 8);
  eocd.writeUInt16LE(relFiles.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset >>> 0, 16);
  eocd.writeUInt16LE(0, 20);

  const tmpZip = `${outputZipPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpZip, Buffer.concat([...localParts, centralDirBuf, eocd]));
    fs.renameSync(tmpZip, outputZipPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
    } catch {}
    throw err;
  }
}

export function inspectZipEntries(zipPath: string): string[] {
  const buf = fs.readFileSync(zipPath);
  // Locate End of Central Directory (EOCD) signature 0x06054b50 from end
  const minOffset = Math.max(0, buf.length - 65557);
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error(`Invalid ZIP archive (missing End of Central Directory): ${zipPath}`);
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries: string[] = [];
  let cursor = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Corrupted ZIP central directory entry at offset ${cursor}`);
    }
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const name = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf-8');
    entries.push(normalizeArchiveRelPath(name));
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function writeTarArchive(sourceDir: string, relFiles: string[], outputTarPath: string): void {
  const root = path.resolve(sourceDir);
  const manifestTmp = path.join(os.tmpdir(), `forecaster_tar_files_${process.pid}_${crypto.randomBytes(4).toString('hex')}.lst`);
  const tmpTar = `${outputTarPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    // Use NUL-separated file list to avoid shell injection or glob surprises and omit excluded paths completely
    fs.writeFileSync(manifestTmp, Buffer.from(relFiles.join('\0') + '\0', 'utf-8'));
    execFileSync('tar', ['-C', root, '-czf', tmpTar, '--null', '-T', manifestTmp], { stdio: 'pipe' });
    fs.renameSync(tmpTar, outputTarPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar);
    } catch {}
    throw err;
  } finally {
    try {
      if (fs.existsSync(manifestTmp)) fs.unlinkSync(manifestTmp);
    } catch {}
  }
}

export function inspectTarEntries(tarPath: string): string[] {
  const stdout = execFileSync('tar', ['-tzf', tarPath], { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
  return stdout
    .split(/\r?\n/)
    .map(s => normalizeArchiveRelPath(s.trim()))
    .filter(Boolean);
}

export function findForbiddenArchiveEntries(entries: string[]): string[] {
  return entries.filter(entry => isForbiddenArchivePath(entry));
}

export interface ArchiveVerificationResult {
  archivePath: string;
  format: 'zip' | 'tar';
  entryCount: number;
  forbiddenEntries: string[];
  hasEnvExample: boolean;
  valid: boolean;
}

export function verifyArchiveFile(
  archivePath: string,
  options: { requireEnvExample?: boolean; deleteOnFailure?: boolean } = {}
): ArchiveVerificationResult {
  const requireEnvExample = options.requireEnvExample ?? false;
  const deleteOnFailure = options.deleteOnFailure ?? true;
  const lower = archivePath.toLowerCase();
  const format: 'zip' | 'tar' = lower.endsWith('.zip') ? 'zip' : 'tar';

  const entries = format === 'zip' ? inspectZipEntries(archivePath) : inspectTarEntries(archivePath);
  const forbiddenEntries = findForbiddenArchiveEntries(entries);
  const hasEnvExample = entries.some(e => normalizeArchiveRelPath(e).toLowerCase() === '.env.example');
  const valid = entries.length > 0 && forbiddenEntries.length === 0 && (!requireEnvExample || hasEnvExample);

  if (!valid) {
    if (deleteOnFailure) {
      try {
        if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
      } catch {}
    }
    const reasons: string[] = [];
    if (entries.length === 0) reasons.push('archive contains 0 entries');
    if (forbiddenEntries.length > 0) {
      reasons.push(`forbidden sensitive files detected: ${forbiddenEntries.join(', ')}`);
    }
    if (requireEnvExample && !hasEnvExample) {
      reasons.push('required .env.example template missing from archive');
    }
    throw new Error(`Archive verification FAILED for ${path.basename(archivePath)}: ${reasons.join('; ')}`);
  }

  return {
    archivePath,
    format,
    entryCount: entries.length,
    forbiddenEntries,
    hasEnvExample,
    valid
  };
}

export interface PackageBuildReport {
  sourceDir: string;
  outDir: string;
  fileCount: number;
  archives: ArchiveVerificationResult[];
  liveDbPreserved: boolean;
  gitAvailable: boolean;
  gitTrackedSensitive: string[];
}

export function packageSourceArchives(options: {
  sourceDir?: string;
  outDir?: string;
  format?: ArchiveFormat;
  baseName?: string;
} = {}): PackageBuildReport {
  const sourceDir = path.resolve(options.sourceDir || process.cwd());
  const outDir = path.resolve(options.outDir || sourceDir);
  const format: ArchiveFormat = options.format || 'both';
  const baseName = options.baseName || 'forecaster-pro-source';

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Capture live DB checksum prior to packaging to assert packaging never modifies or deletes it
  const liveDbPath = path.join(sourceDir, 'data', 'cloud-ledger-db.json');
  const preDbHash = fs.existsSync(liveDbPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(liveDbPath)).digest('hex')
    : null;

  const files = collectSafeSourceFiles(sourceDir);
  if (files.length === 0) {
    throw new Error(`No packagable source files found in ${sourceDir}`);
  }

  const requireEnvExample = fs.existsSync(path.join(sourceDir, '.env.example'));
  const results: ArchiveVerificationResult[] = [];

  if (format === 'zip' || format === 'both') {
    const zipPath = path.join(outDir, `${baseName}.zip`);
    writeZipArchive(sourceDir, files, zipPath);
    results.push(verifyArchiveFile(zipPath, { requireEnvExample, deleteOnFailure: true }));
  }

  if (format === 'tar' || format === 'both') {
    const tarPath = path.join(outDir, `${baseName}.tar.gz`);
    writeTarArchive(sourceDir, files, tarPath);
    results.push(verifyArchiveFile(tarPath, { requireEnvExample, deleteOnFailure: true }));
  }

  const postDbHash = fs.existsSync(liveDbPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(liveDbPath)).digest('hex')
    : null;
  const liveDbPreserved = preDbHash === postDbHash;
  if (!liveDbPreserved) {
    throw new Error('Critical integrity failure: live runtime database changed during packaging!');
  }

  let gitAvailable = false;
  let gitTrackedSensitive: string[] = [];
  if (fs.existsSync(path.join(sourceDir, '.git'))) {
    gitAvailable = true;
    try {
      const tracked = execFileSync('git', ['-C', sourceDir, 'ls-files'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      gitTrackedSensitive = findForbiddenArchiveEntries(tracked);
    } catch {
      gitAvailable = false;
    }
  }

  return {
    sourceDir,
    outDir,
    fileCount: files.length,
    archives: results,
    liveDbPreserved,
    gitAvailable,
    gitTrackedSensitive
  };
}

function runCli() {
  const args = process.argv.slice(2);
  let format: ArchiveFormat = 'both';
  let outDir = process.cwd();
  let sourceDir = process.cwd();
  let verifyOnlyPath = '';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      const val = arg.split('=')[1];
      if (val === 'zip' || val === 'tar' || val === 'both') format = val;
    } else if (arg.startsWith('--out-dir=')) {
      outDir = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--source-dir=')) {
      sourceDir = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--verify-only=')) {
      verifyOnlyPath = path.resolve(arg.split('=')[1]);
    }
  }

  if (verifyOnlyPath) {
    const res = verifyArchiveFile(verifyOnlyPath, { requireEnvExample: false, deleteOnFailure: false });
    console.log(`✅ Verified archive ${path.basename(res.archivePath)}: ${res.entryCount} entries, 0 forbidden files.`);
    return;
  }

  const report = packageSourceArchives({ sourceDir, outDir, format });
  console.log(`\n📦 Safe Source Packaging Complete (${report.fileCount} source files):`);
  for (const a of report.archives) {
    const sizeKb = (fs.statSync(a.archivePath).size / 1024).toFixed(1);
    console.log(`  ✅ ${path.basename(a.archivePath)} (${sizeKb} KB, ${a.entryCount} entries, 0 sensitive files, .env.example=${a.hasEnvExample})`);
  }
  console.log(`  ✅ Live runtime DB preserved intact: ${report.liveDbPreserved}`);
  if (report.gitAvailable) {
    if (report.gitTrackedSensitive.length > 0) {
      console.error(`  ❌ WARNING: Git tracks sensitive files: ${report.gitTrackedSensitive.join(', ')}`);
      process.exit(1);
    }
    console.log('  ✅ Local Git tracking check: 0 sensitive files tracked.');
  } else {
    console.log('  ℹ️ Local .git directory unavailable in this workspace; external GitHub history verification remains pending.');
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  try {
    runCli();
  } catch (err: any) {
    console.error(`\n❌ Packaging failed: ${err?.message || err}`);
    process.exit(1);
  }
}
