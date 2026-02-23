/**
 * Download Python Build Standalone for Electron bundling
 * 
 * This script downloads pre-built Python binaries from python-build-standalone
 * and installs the required dependencies into a separate site-packages folder.
 * 
 * Usage:
 *   node scripts/download-python.cjs           # Download for current platform
 *   node scripts/download-python.cjs --all     # Download for all platforms
 *   node scripts/download-python.cjs --win     # Download for Windows only
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');
const { createGunzip } = require('zlib');
const tar = require('tar');

// Python version configuration
const PYTHON_VERSION = '3.11.9';
const RELEASE_TAG = '20240726';
const BASE_URL = `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}`;

// Platform configurations
const PLATFORM_CONFIGS = {
  'win32-x64': {
    filename: `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`,
    pythonBinary: 'python.exe',
    pipBinary: 'Scripts/pip.exe',
  },
  'darwin-arm64': {
    filename: `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz`,
    pythonBinary: 'bin/python3',
    pipBinary: 'bin/pip3',
  },
  'darwin-x64': {
    filename: `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-apple-darwin-install_only_stripped.tar.gz`,
    pythonBinary: 'bin/python3',
    pipBinary: 'bin/pip3',
  },
  'linux-x64': {
    filename: `cpython-${PYTHON_VERSION}+${RELEASE_TAG}-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz`,
    pythonBinary: 'bin/python3',
    pipBinary: 'bin/pip3',
  },
};

// Directories
const SCRIPTS_DIR = __dirname;
const FRONTEND_DIR = path.dirname(SCRIPTS_DIR);
const PROJECT_ROOT = path.dirname(FRONTEND_DIR);
const PYTHON_RUNTIME_DIR = path.join(FRONTEND_DIR, 'python-runtime');
const REQUIREMENTS_PATH = path.join(PROJECT_ROOT, 'pyproject.toml');

/**
 * Download a file from URL to destination
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    
    const file = fs.createWriteStream(dest);
    
    const request = (url) => {
      https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        
        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\rProgress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log('\nDownload complete');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };
    
    request(url);
  });
}

/**
 * Extract tar.gz file
 */
async function extractTarGz(archivePath, destDir) {
  console.log(`Extracting to: ${destDir}`);
  
  await fs.promises.mkdir(destDir, { recursive: true });
  
  await tar.extract({
    file: archivePath,
    cwd: destDir,
    strip: 1, // Remove top-level 'python' directory
  });
  
  console.log('Extraction complete');
}

/**
 * Install Python packages to target directory
 */
async function installPackages(pythonPath, sitePackagesDir) {
  console.log(`\nInstalling packages to: ${sitePackagesDir}`);
  
  await fs.promises.mkdir(sitePackagesDir, { recursive: true });
  
  // Read dependencies from pyproject.toml
  const pyprojectContent = fs.readFileSync(REQUIREMENTS_PATH, 'utf-8');
  const lines = pyprojectContent.split('\n');
  
  // Find dependencies section with line-by-line parsing
  // This handles brackets in package specs like uvicorn[standard]
  const deps = [];
  let inDependencies = false;
  let bracketDepth = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Start of dependencies section
    if (trimmed.startsWith('dependencies') && trimmed.includes('=') && trimmed.includes('[')) {
      inDependencies = true;
      bracketDepth = 1;
      // Check if there are deps on the same line
      const afterBracket = trimmed.split('[').slice(1).join('[');
      if (afterBracket) {
        const match = afterBracket.match(/["']([^"']+)["']/);
        if (match) {
          deps.push(match[1]);
        }
      }
      continue;
    }
    
    if (!inDependencies) continue;
    
    // End of dependencies section (line with only ] or ])
    if (trimmed === ']' || trimmed === '],') {
      break;
    }
    
    // Skip empty lines and comment-only lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Extract quoted package name
    const match = trimmed.match(/["']([^"']+)["']/);
    if (match) {
      const dep = match[1].trim();
      if (dep) {
        deps.push(dep);
      }
    }
  }
  
  if (deps.length === 0) {
    throw new Error('Could not find dependencies in pyproject.toml');
  }
  
  console.log(`Found ${deps.length} dependencies to install:`);
  deps.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
  
  // Create a temporary requirements file
  const tempReqPath = path.join(PYTHON_RUNTIME_DIR, 'requirements.txt');
  fs.writeFileSync(tempReqPath, deps.join('\n'));
  
  // Install packages
  const pipArgs = [
    '-m', 'pip', 'install',
    '--no-compile',
    '--no-cache-dir',
    '--target', sitePackagesDir,
    '-r', tempReqPath,
  ];
  
  console.log(`\nRunning: ${pythonPath} ${pipArgs.join(' ')}`);
  
  return new Promise((resolve, reject) => {
    const pip = spawn(pythonPath, pipArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    
    pip.on('close', (code) => {
      fs.unlinkSync(tempReqPath);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pip install failed with code ${code}`));
      }
    });
    
    pip.on('error', reject);
  });
}

/**
 * Strip unnecessary files from site-packages to reduce bundle size
 */
async function stripSitePackages(sitePackagesDir) {
  console.log('\nStripping unnecessary files...');
  
  const patternsToDelete = [
    '**/__pycache__',
    '**/*.pyc',
    '**/*.pyo',
    '**/tests',
    '**/test',
    '**/*.md',
    '**/*.rst',
    '**/*.txt',
    '**/docs',
    '**/examples',
    '**/.git',
  ];
  
  let deletedCount = 0;
  
  const walkDir = async (dir) => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Check if should delete
      const shouldDelete = 
        entry.name === '__pycache__' ||
        entry.name === 'tests' ||
        entry.name === 'test' ||
        entry.name === 'docs' ||
        entry.name === 'examples' ||
        entry.name.endsWith('.pyc') ||
        entry.name.endsWith('.pyo');
      
      if (shouldDelete) {
        await fs.promises.rm(fullPath, { recursive: true, force: true });
        deletedCount++;
        continue;
      }
      
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      }
    }
  };
  
  await walkDir(sitePackagesDir);
  console.log(`Stripped ${deletedCount} items`);
}

/**
 * Download and setup Python for a specific platform
 */
async function setupPlatform(platformKey) {
  const config = PLATFORM_CONFIGS[platformKey];
  if (!config) {
    throw new Error(`Unknown platform: ${platformKey}`);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Setting up Python for: ${platformKey}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const platformDir = path.join(PYTHON_RUNTIME_DIR, platformKey);
  const pythonDir = path.join(platformDir, 'python');
  const sitePackagesDir = path.join(platformDir, 'site-packages');
  const archivePath = path.join(PYTHON_RUNTIME_DIR, config.filename);
  
  // Create directories
  await fs.promises.mkdir(platformDir, { recursive: true });
  
  // Download Python if not exists
  if (!fs.existsSync(pythonDir)) {
    const downloadUrl = `${BASE_URL}/${config.filename}`;
    
    if (!fs.existsSync(archivePath)) {
      await downloadFile(downloadUrl, archivePath);
    }
    
    await extractTarGz(archivePath, pythonDir);
    
    // Clean up archive
    fs.unlinkSync(archivePath);
  } else {
    console.log('Python already downloaded, skipping...');
  }
  
  // Install packages if not exists
  if (!fs.existsSync(sitePackagesDir) || fs.readdirSync(sitePackagesDir).length === 0) {
    const pythonBinaryPath = path.join(pythonDir, config.pythonBinary);
    
    // Make sure Python is executable (Unix)
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(pythonBinaryPath, '755');
      } catch (e) {
        // Ignore
      }
    }
    
    await installPackages(pythonBinaryPath, sitePackagesDir);
    await stripSitePackages(sitePackagesDir);
  } else {
    console.log('Packages already installed, skipping...');
  }
  
  console.log(`\nSetup complete for ${platformKey}`);
}

/**
 * Get current platform key
 */
function getCurrentPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'win32') {
    return 'win32-x64';
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  } else if (platform === 'linux') {
    return 'linux-x64';
  }
  
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Ensure tar module is available
  try {
    require('tar');
  } catch (e) {
    console.log('Installing tar module...');
    execSync('npm install tar', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  }
  
  // Ensure python-runtime directory exists
  await fs.promises.mkdir(PYTHON_RUNTIME_DIR, { recursive: true });
  
  if (args.includes('--all')) {
    // Download for all platforms
    for (const platformKey of Object.keys(PLATFORM_CONFIGS)) {
      await setupPlatform(platformKey);
    }
  } else if (args.includes('--win')) {
    await setupPlatform('win32-x64');
  } else if (args.includes('--mac')) {
    const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    await setupPlatform(arch);
  } else if (args.includes('--linux')) {
    await setupPlatform('linux-x64');
  } else {
    // Download for current platform only
    const platformKey = getCurrentPlatformKey();
    await setupPlatform(platformKey);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('All done! Python runtime is ready for bundling.');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
