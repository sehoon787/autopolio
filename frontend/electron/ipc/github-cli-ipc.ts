// IPC Handlers - GitHub CLI (Device Code Flow, Repos, Auth)
import { BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, execSync, ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getAugmentedEnv } from '../utils/env-utils.js'

let activeGitHubAuthProcess: ChildProcess | null = null
let cachedGitHubCLIPath: string | null = null

const DEVICE_CODE_PATTERN = /(?:one-time code|verification code|code):\s*([A-Z0-9]{4}[-\s][A-Z0-9]{4})/i
const DEVICE_URL_PATTERN = /https:\/\/github\.com\/login\/device/i

const GITHUB_CLI_PATHS = {
  win32: [
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'gh', 'bin', 'gh.exe'),
    path.join(os.homedir(), 'scoop', 'shims', 'gh.exe'),
  ],
  darwin: [
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
  ],
  linux: [
    '/usr/bin/gh',
    '/usr/local/bin/gh',
    path.join(os.homedir(), '.local', 'bin', 'gh'),
  ],
}

export interface GitHubCLIIPCDeps {
  getMainWindow: () => BrowserWindow | null
  isDev: boolean
  frontendPort: number
}

async function detectGitHubCLI(): Promise<{
  installed: boolean
  version: string | null
  path: string | null
  authenticated: boolean
  username: string | null
  scopes: string[]
}> {
  const result = {
    installed: false,
    version: null as string | null,
    path: null as string | null,
    authenticated: false,
    username: null as string | null,
    scopes: [] as string[],
  }

  const runGhCommand = (ghPath: string, args: string): string | null => {
    try {
      return execSync(`"${ghPath}" ${args}`, { encoding: 'utf8', timeout: 10000 }).trim()
    } catch {
      return null
    }
  }

  try {
    let ghPath: string | null = null
    const platform = process.platform as keyof typeof GITHUB_CLI_PATHS
    const knownPaths = GITHUB_CLI_PATHS[platform] || []

    // On macOS/Linux, check known paths FIRST (fast-path for GUI-launched apps)
    if (process.platform !== 'win32') {
      for (const candidatePath of knownPaths) {
        if (fs.existsSync(candidatePath)) {
          console.log('[GitHub CLI] Found at known path (fast-path):', candidatePath)
          ghPath = candidatePath
          break
        }
      }
    }

    // If not found via fast-path, try to find gh in PATH with augmented environment
    if (!ghPath) {
      try {
        const augmentedEnv = getAugmentedEnv()
        if (process.platform === 'win32') {
          const whereOutput = execSync('where gh', {
            encoding: 'utf8',
            timeout: 5000,
            env: augmentedEnv,
          }).trim()
          ghPath = whereOutput.split('\n')[0]
          console.log('[GitHub CLI] Found in PATH:', ghPath)
        } else {
          const whichOutput = execSync('which gh', {
            encoding: 'utf8',
            timeout: 5000,
            env: augmentedEnv,
          }).trim()
          ghPath = whichOutput
          console.log('[GitHub CLI] Found in PATH:', ghPath)
        }
      } catch {
        console.log('[GitHub CLI] gh not found in PATH, checking known locations...')
      }
    }

    // Windows fallback: check known paths
    if (!ghPath && process.platform === 'win32') {
      for (const candidatePath of knownPaths) {
        if (fs.existsSync(candidatePath)) {
          console.log('[GitHub CLI] Found at known path:', candidatePath)
          ghPath = candidatePath
          break
        }
      }
    }

    if (!ghPath) {
      console.log('[GitHub CLI] Not found in any known location')
      return result
    }

    // Get version using the found path
    const versionOutput = runGhCommand(ghPath, '--version')
    if (versionOutput) {
      const versionMatch = versionOutput.match(/gh version ([\d.]+)/)
      if (versionMatch) {
        result.installed = true
        result.version = versionMatch[1]
        result.path = ghPath
        console.log('[GitHub CLI] Version:', result.version)
      }
    }

    if (!result.installed) {
      return result
    }

    // Cache the found path
    cachedGitHubCLIPath = ghPath

    // Check authentication status
    try {
      const authOutput = execSync(`"${ghPath}" auth status 2>&1`, { encoding: 'utf8', timeout: 10000 })

      if (authOutput.includes('Logged in to') || authOutput.includes('\u2713')) {
        result.authenticated = true

        const usernameMatch = authOutput.match(/Logged in to github\.com account (\S+)/i)
          || authOutput.match(/Logged in to github\.com as (\S+)/i)
          || authOutput.match(/account (\S+) \(/i)
        if (usernameMatch) {
          result.username = usernameMatch[1].replace(/[()]/g, '')
        }

        const scopesMatch = authOutput.match(/Token scopes:?\s*['"]?([^'">\n]+)/i)
        if (scopesMatch) {
          result.scopes = scopesMatch[1].split(',').map(s => s.trim()).filter(Boolean)
        }
      }
    } catch (authError: unknown) {
      const errorMessage = authError instanceof Error ? authError.message : String(authError)
      console.log('[GitHub CLI] Auth check failed:', errorMessage)

      if (errorMessage.includes('Logged in to')) {
        result.authenticated = true
        const usernameMatch = errorMessage.match(/Logged in to github\.com account (\S+)/i)
          || errorMessage.match(/account (\S+) \(/i)
        if (usernameMatch) {
          result.username = usernameMatch[1].replace(/[()]/g, '')
        }
      }
    }

    console.log('[GitHub CLI] Detection result:', result)
    return result
  } catch (error) {
    console.error('[GitHub CLI] Detection error:', error)
    return result
  }
}

async function getGitHubCLIPath(): Promise<string | null> {
  if (cachedGitHubCLIPath) {
    return cachedGitHubCLIPath
  }
  const status = await detectGitHubCLI()
  return status.path
}

/**
 * Execute a gh api command and parse the paginated JSON output.
 */
function execGhApi(ghPath: string, endpoint: string, opts?: { timeout?: number }): any[] {
  const timeout = opts?.timeout ?? 60000
  try {
    const command = `"${ghPath}" api "${endpoint}" --paginate`
    const output = execSync(command, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 50 * 1024 * 1024,
    })
    const results: any[] = []
    for (const part of output.trim().split('\n')) {
      if (!part.trim()) continue
      try {
        const parsed = JSON.parse(part)
        if (Array.isArray(parsed)) {
          results.push(...parsed)
        } else {
          results.push(parsed)
        }
      } catch {
        // skip invalid JSON fragments
      }
    }
    return results
  } catch (error) {
    console.warn(`[GitHub CLI] gh api ${endpoint} failed:`, error instanceof Error ? error.message : error)
    return []
  }
}

function execGhApiAsync(ghPath: string, endpoint: string, opts?: { timeout?: number }): Promise<any[]> {
  return new Promise((resolve) => {
    try {
      resolve(execGhApi(ghPath, endpoint, opts))
    } catch {
      resolve([])
    }
  })
}

export function registerGitHubCLIIPC(deps: GitHubCLIIPCDeps): void {
  ipcMain.handle('github-cli:status', async () => {
    console.log('[IPC] github-cli:status called')
    try {
      const status = await detectGitHubCLI()

      let install_command = ''
      if (process.platform === 'win32') {
        install_command = 'winget install --id GitHub.cli'
      } else if (process.platform === 'darwin') {
        install_command = 'brew install gh'
      } else {
        install_command = 'sudo apt install gh  # or: sudo dnf install gh'
      }

      return {
        ...status,
        install_command,
      }
    } catch (error) {
      console.error('[IPC] github-cli:status error:', error)
      return {
        installed: false,
        version: null,
        path: null,
        authenticated: false,
        username: null,
        scopes: [],
        install_command: process.platform === 'win32' ? 'winget install --id GitHub.cli' : 'brew install gh',
      }
    }
  })

  ipcMain.handle('github-cli:start-auth', async () => {
    console.log('[IPC] github-cli:start-auth called')

    if (activeGitHubAuthProcess) {
      activeGitHubAuthProcess.kill()
      activeGitHubAuthProcess = null
    }

    const ghPath = await getGitHubCLIPath()
    if (!ghPath) {
      console.error('[GitHub Auth] gh CLI not found')
      return { success: false, error: 'GitHub CLI not installed' }
    }

    return new Promise((resolve) => {
      let output = ''
      let deviceCode: string | null = null
      let browserOpened = false

      const args = ['auth', 'login', '--web', '--scopes', 'repo,read:user']
      console.log('[GitHub Auth] Starting:', ghPath, args.join(' '))

      activeGitHubAuthProcess = spawn(ghPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      })

      const mainWindow = deps.getMainWindow()

      const tryExtractAndOpenBrowser = async () => {
        const codeMatch = output.match(DEVICE_CODE_PATTERN)
        if (codeMatch && !deviceCode) {
          deviceCode = codeMatch[1].replace(' ', '-')
          console.log('[GitHub Auth] Device code extracted:', deviceCode)

          if (mainWindow) {
            mainWindow.webContents.send('github-cli:device-code', {
              device_code: deviceCode,
              user_code: deviceCode,
              verification_uri: 'https://github.com/login/device',
            })
          }

          if (!browserOpened && output.match(DEVICE_URL_PATTERN)) {
            browserOpened = true
            try {
              await shell.openExternal('https://github.com/login/device')
              console.log('[GitHub Auth] Browser opened for device flow')
            } catch (browserError) {
              console.error('[GitHub Auth] Failed to open browser:', browserError)
            }
          }
        }
      }

      activeGitHubAuthProcess.stdout?.on('data', (data) => {
        output += data.toString()
        console.log('[GitHub Auth] stdout:', data.toString().trim())
        tryExtractAndOpenBrowser()
      })

      activeGitHubAuthProcess.stderr?.on('data', (data) => {
        output += data.toString()
        console.log('[GitHub Auth] stderr:', data.toString().trim())
        tryExtractAndOpenBrowser()
      })

      activeGitHubAuthProcess.on('close', async (code) => {
        console.log('[GitHub Auth] Process exited with code:', code)
        activeGitHubAuthProcess = null
        const currentMainWindow = deps.getMainWindow()

        if (code === 0) {
          try {
            const authStatus = execSync(`"${ghPath}" auth status 2>&1`, { encoding: 'utf8', timeout: 5000 })

            let username = null
            const usernameMatch = authStatus.match(/Logged in to github\.com account (\S+)/i)
              || authStatus.match(/Logged in to github\.com as (\S+)/i)
              || authStatus.match(/account (\S+) \(/i)
            if (usernameMatch) {
              username = usernameMatch[1].replace(/[()]/g, '')
            }

            let token = null
            try {
              token = execSync(`"${ghPath}" auth token`, { encoding: 'utf8', timeout: 5000 }).trim()
            } catch {
              console.log('[GitHub Auth] Could not get token, will use gh CLI for API calls')
            }

            resolve({
              success: true,
              username,
              token,
            })

            if (currentMainWindow) {
              currentMainWindow.webContents.send('github-cli:auth-complete', {
                success: true,
                username,
                token,
              })
            }
          } catch (error) {
            console.error('[GitHub Auth] Failed to get auth info after login:', error)
            resolve({
              success: true,
              username: null,
              token: null,
            })
          }
        } else {
          resolve({
            success: false,
            error: `Authentication failed (exit code: ${code})`,
          })

          if (currentMainWindow) {
            currentMainWindow.webContents.send('github-cli:auth-complete', {
              success: false,
              error: `Authentication failed (exit code: ${code})`,
            })
          }
        }
      })

      activeGitHubAuthProcess.on('error', (error) => {
        console.error('[GitHub Auth] Process error:', error)
        activeGitHubAuthProcess = null
        resolve({
          success: false,
          error: error.message,
        })
      })

      // Return initial status while auth is in progress
      setTimeout(() => {
        if (deviceCode) {
          resolve({
            success: true,
            pending: true,
            device_code: deviceCode,
            verification_uri: 'https://github.com/login/device',
          })
        }
      }, 3000)
    })
  })

  ipcMain.handle('github-cli:cancel-auth', async () => {
    console.log('[IPC] github-cli:cancel-auth called')
    if (activeGitHubAuthProcess) {
      activeGitHubAuthProcess.kill()
      activeGitHubAuthProcess = null
      return { success: true }
    }
    return { success: true, message: 'No active auth process' }
  })

  ipcMain.handle('github-cli:logout', async () => {
    console.log('[IPC] github-cli:logout called')
    try {
      const ghPath = await getGitHubCLIPath()
      if (!ghPath) {
        return { success: false, error: 'GitHub CLI not found' }
      }
      execSync(`"${ghPath}" auth logout --hostname github.com`, { encoding: 'utf8', timeout: 10000, input: 'Y\n' })
      return { success: true }
    } catch (error) {
      console.error('[GitHub CLI] Logout error:', error)
      return { success: true }
    }
  })

  ipcMain.handle('github-cli:get-token', async () => {
    console.log('[IPC] github-cli:get-token called')
    try {
      const ghPath = await getGitHubCLIPath()
      if (!ghPath) {
        return { success: false, error: 'GitHub CLI not found' }
      }
      const token = execSync(`"${ghPath}" auth token`, { encoding: 'utf8', timeout: 5000 }).trim()
      return { success: true, token }
    } catch (error) {
      console.error('[GitHub CLI] Get token error:', error)
      return { success: false, error: 'Not authenticated or token not available' }
    }
  })

  ipcMain.handle('github-cli:list-repos', async () => {
    console.log('[IPC] github-cli:list-repos called (parallel)')
    const startTime = Date.now()
    try {
      const ghPath = await getGitHubCLIPath()
      if (!ghPath) {
        return { success: false, error: 'GitHub CLI not found' }
      }

      // Step 0: Get username + org lists
      let username = ''
      try {
        const userInfo = execGhApi(ghPath, '/user')
        if (userInfo.length > 0) {
          username = userInfo[0]?.login || ''
        }
      } catch { /* ignore */ }

      // Get org logins from both sources in parallel
      const [orgs, memberships] = await Promise.all([
        execGhApiAsync(ghPath, '/user/orgs'),
        execGhApiAsync(ghPath, '/user/memberships/orgs'),
      ])

      const orgLogins = new Set<string>()
      for (const org of orgs) {
        if (org?.login) orgLogins.add(org.login)
      }
      for (const m of memberships) {
        const login = m?.organization?.login
        if (login) orgLogins.add(login)
      }

      console.log(`[GitHub CLI] User: ${username}, Orgs: ${orgLogins.size}`)

      // Run all steps in parallel
      const tasks: Promise<any[]>[] = [
        execGhApiAsync(ghPath, '/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc', { timeout: 120000 }),
      ]

      if (username) {
        tasks.push(execGhApiAsync(ghPath, `/users/${username}/repos?per_page=100&sort=pushed&type=all`))
      }

      for (const orgLogin of orgLogins) {
        tasks.push(execGhApiAsync(ghPath, `/orgs/${orgLogin}/repos?per_page=100&sort=pushed&type=all`))
      }

      if (username) {
        tasks.push(
          execGhApiAsync(ghPath, `/search/repositories?q=user:${username}&per_page=100&page=1`).then(results => {
            if (results.length > 0 && results[0]?.items) return results[0].items
            return results
          })
        )
      }

      const allResults = await Promise.all(tasks)

      // Merge and deduplicate
      const seenIds = new Set<number>()
      const allRepos: any[] = []
      for (const repos of allResults) {
        if (!Array.isArray(repos)) continue
        for (const repo of repos) {
          if (repo.id && !seenIds.has(repo.id)) {
            seenIds.add(repo.id)
            allRepos.push(repo)
          }
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[GitHub CLI] Total: ${allRepos.length} repos in ${elapsed}s`)

      // Transform to match backend API format
      const transformedRepos = allRepos.map((repo: any) => ({
        id: repo.id || 0,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        clone_url: repo.clone_url,
        language: repo.language || null,
        stargazers_count: repo.stargazers_count || 0,
        forks_count: repo.forks_count || 0,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        fork: repo.fork || false,
        owner: repo.owner?.login || ''
      }))

      return {
        success: true,
        repos: transformedRepos,
        total: transformedRepos.length
      }
    } catch (error) {
      console.error('[GitHub CLI] List repos error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('auth') || errorMessage.includes('login')) {
        return { success: false, error: 'Not authenticated. Please run: gh auth login' }
      }

      return { success: false, error: `Failed to list repos: ${errorMessage}` }
    }
  })
}
