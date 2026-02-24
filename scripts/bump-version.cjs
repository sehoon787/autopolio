#!/usr/bin/env node

/**
 * bump-version.cjs — Synchronize version across all project files.
 *
 * Usage:
 *   node scripts/bump-version.cjs patch   # 1.19.0 -> 1.19.1
 *   node scripts/bump-version.cjs minor   # 1.19.0 -> 1.20.0
 *   node scripts/bump-version.cjs major   # 1.19.0 -> 2.0.0
 *   node scripts/bump-version.cjs 1.20.0  # Set explicit version
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const FILES = {
  pyproject: path.join(ROOT, 'pyproject.toml'),
  apiInit: path.join(ROOT, 'api', '__init__.py'),
  frontendPkg: path.join(ROOT, 'frontend', 'package.json'),
};

function readCurrentVersion() {
  const content = fs.readFileSync(FILES.apiInit, 'utf8');
  const match = content.match(/__version__\s*=\s*"([^"]+)"/);
  if (!match) {
    console.error('Could not read version from api/__init__.py');
    process.exit(1);
  }
  return match[1];
}

function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error(`Invalid version format: ${current}`);
    process.exit(1);
  }

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default:
      // Treat as explicit version
      if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(type)) {
        return type;
      }
      console.error(`Unknown bump type: ${type}`);
      console.error('Usage: node scripts/bump-version.cjs <patch|minor|major|X.Y.Z>');
      process.exit(1);
  }
}

function updatePyproject(newVersion) {
  const filePath = FILES.pyproject;
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${newVersion}"`
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  pyproject.toml        -> ${newVersion}`);
}

function updateApiInit(newVersion) {
  const filePath = FILES.apiInit;
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(
    /__version__\s*=\s*"[^"]+"/,
    `__version__ = "${newVersion}"`
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  api/__init__.py       -> ${newVersion}`);
}

function updateFrontendPkg(newVersion) {
  const filePath = FILES.frontendPkg;
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`  frontend/package.json -> ${newVersion}`);
}

// --- Main ---
const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/bump-version.cjs <patch|minor|major|X.Y.Z>');
  process.exit(1);
}

const current = readCurrentVersion();
const next = bumpVersion(current, arg);

console.log(`\nBumping version: ${current} -> ${next}\n`);

updatePyproject(next);
updateApiInit(next);
updateFrontendPkg(next);

console.log(`\nDone! Version updated to ${next} in all files.`);
console.log(`\nNext steps:`);
console.log(`  git add pyproject.toml api/__init__.py frontend/package.json`);
console.log(`  git commit -m "chore: bump version to ${next}"\n`);
