/**
 * Agent Process Manager - CLI process lifecycle management
 *
 * Auto-Claude style implementation for Autopolio
 * Handles CLI process spawning, streaming, and cleanup
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { isWindows } from '../types/cli.js';
import { getCLIToolManager } from './cli-tool-manager.js';
/**
 * AgentProcessManager - Singleton class for managing CLI processes
 */
export class AgentProcessManager extends EventEmitter {
    static instance;
    // Active processes
    processes = new Map();
    // Output subscribers
    subscribers = new Map();
    // Kill timeout for graceful shutdown
    KILL_TIMEOUT_MS = 10000;
    constructor() {
        super();
    }
    static getInstance() {
        if (!AgentProcessManager.instance) {
            AgentProcessManager.instance = new AgentProcessManager();
        }
        return AgentProcessManager.instance;
    }
    // ============================================================================
    // Public API
    // ============================================================================
    /**
     * Start a CLI process
     */
    async startCLI(config) {
        const { tool, cwd, args = [], env = {}, prompt } = config;
        // Get CLI path from tool manager
        const cliManager = getCLIToolManager();
        const status = await cliManager.detectCLI(tool);
        if (!status.installed || !status.path) {
            throw new Error(`${tool} is not installed`);
        }
        const sessionId = randomUUID();
        console.log(`[AgentProcessManager] Starting ${tool} session: ${sessionId}`);
        // Prepare spawn arguments
        const cliPath = status.path;
        const spawnArgs = [...args];
        // Add prompt if provided
        if (prompt) {
            spawnArgs.push(prompt);
        }
        // Determine if we need shell
        const needsShell = isWindows &&
            (cliPath.toLowerCase().endsWith('.cmd') || cliPath.toLowerCase().endsWith('.bat'));
        // Spawn the process
        const childProcess = spawn(cliPath, spawnArgs, {
            cwd,
            shell: needsShell,
            env: {
                ...process.env,
                ...env,
                // Disable color output for cleaner parsing
                NO_COLOR: '1',
                FORCE_COLOR: '0',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Create managed process entry
        const managedProcess = {
            id: sessionId,
            tool,
            process: childProcess,
            status: 'starting',
            cwd,
            startedAt: new Date(),
            pid: childProcess.pid,
            outputBuffer: [],
        };
        this.processes.set(sessionId, managedProcess);
        // Setup event handlers
        this.setupProcessHandlers(sessionId, managedProcess);
        // Update status to running once we get first output
        setTimeout(() => {
            const proc = this.processes.get(sessionId);
            if (proc && proc.status === 'starting') {
                proc.status = 'running';
                this.emitSystemMessage(sessionId, `${tool} started (PID: ${proc.pid})`);
            }
        }, 1000);
        return sessionId;
    }
    /**
     * Stop a CLI process
     */
    async stopCLI(sessionId) {
        const managedProcess = this.processes.get(sessionId);
        if (!managedProcess) {
            console.log(`[AgentProcessManager] Session not found: ${sessionId}`);
            return;
        }
        console.log(`[AgentProcessManager] Stopping session: ${sessionId}`);
        managedProcess.status = 'stopping';
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                // Force kill if not stopped gracefully
                if (managedProcess.process.pid) {
                    this.forceKill(managedProcess);
                }
                resolve();
            }, this.KILL_TIMEOUT_MS);
            managedProcess.process.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
            // Send SIGTERM for graceful shutdown
            if (isWindows) {
                this.forceKill(managedProcess);
            }
            else {
                managedProcess.process.kill('SIGTERM');
            }
        });
    }
    /**
     * Get process status
     */
    getStatus(sessionId) {
        const managedProcess = this.processes.get(sessionId);
        if (!managedProcess) {
            return null;
        }
        return {
            sessionId,
            tool: managedProcess.tool,
            status: managedProcess.status,
            pid: managedProcess.pid,
            startedAt: managedProcess.startedAt.toISOString(),
            error: managedProcess.error,
        };
    }
    /**
     * Get all active sessions
     */
    getActiveSessions() {
        const sessions = [];
        for (const [sessionId, proc] of this.processes) {
            if (proc.status === 'running' || proc.status === 'starting') {
                sessions.push({
                    sessionId,
                    tool: proc.tool,
                    status: proc.status,
                    pid: proc.pid,
                    startedAt: proc.startedAt.toISOString(),
                });
            }
        }
        return sessions;
    }
    /**
     * Subscribe to output for a session
     */
    onOutput(sessionId, callback) {
        let subscribers = this.subscribers.get(sessionId);
        if (!subscribers) {
            subscribers = new Set();
            this.subscribers.set(sessionId, subscribers);
        }
        subscribers.add(callback);
        // Return unsubscribe function
        return () => {
            subscribers?.delete(callback);
            if (subscribers?.size === 0) {
                this.subscribers.delete(sessionId);
            }
        };
    }
    /**
     * Send input to a process
     */
    sendInput(sessionId, input) {
        const managedProcess = this.processes.get(sessionId);
        if (!managedProcess || managedProcess.status !== 'running') {
            return false;
        }
        if (managedProcess.process.stdin) {
            managedProcess.process.stdin.write(input);
            return true;
        }
        return false;
    }
    /**
     * Stop all processes (for app shutdown)
     */
    async stopAll() {
        console.log('[AgentProcessManager] Stopping all processes...');
        const stopPromises = Array.from(this.processes.keys()).map((sessionId) => this.stopCLI(sessionId));
        await Promise.all(stopPromises);
        console.log('[AgentProcessManager] All processes stopped');
    }
    // ============================================================================
    // Process Event Handlers
    // ============================================================================
    setupProcessHandlers(sessionId, managedProcess) {
        const { process: childProcess } = managedProcess;
        // Handle stdout
        childProcess.stdout?.on('data', (data) => {
            const text = data.toString('utf8');
            this.handleOutput(sessionId, 'stdout', text);
        });
        // Handle stderr
        childProcess.stderr?.on('data', (data) => {
            const text = data.toString('utf8');
            this.handleOutput(sessionId, 'stderr', text);
            // Check for errors in stderr
            const error = this.detectErrors(text);
            if (error) {
                managedProcess.error = error;
                this.emit('error', sessionId, error);
            }
        });
        // Handle process exit
        childProcess.on('exit', (code, signal) => {
            console.log(`[AgentProcessManager] Process exited: ${sessionId} (code: ${code}, signal: ${signal})`);
            managedProcess.status = code === 0 ? 'stopped' : 'error';
            if (code !== 0 && !managedProcess.error) {
                managedProcess.error = {
                    type: 'execution_failed',
                    message: `Process exited with code ${code}`,
                };
            }
            this.emitSystemMessage(sessionId, `Process exited (code: ${code})`);
            this.emit('exit', sessionId, code, signal);
            // Cleanup after a delay (allow subscribers to receive final messages)
            setTimeout(() => {
                this.cleanup(sessionId);
            }, 5000);
        });
        // Handle process error
        childProcess.on('error', (error) => {
            console.error(`[AgentProcessManager] Process error: ${sessionId}`, error);
            managedProcess.status = 'error';
            managedProcess.error = {
                type: 'execution_failed',
                message: error.message,
            };
            this.emitSystemMessage(sessionId, `Error: ${error.message}`);
            this.emit('error', sessionId, managedProcess.error);
        });
    }
    // ============================================================================
    // Output Handling
    // ============================================================================
    handleOutput(sessionId, type, data) {
        const managedProcess = this.processes.get(sessionId);
        if (!managedProcess)
            return;
        // Store in buffer
        managedProcess.outputBuffer.push({ type, data, timestamp: Date.now() });
        // Trim buffer if too large
        if (managedProcess.outputBuffer.length > 10000) {
            managedProcess.outputBuffer = managedProcess.outputBuffer.slice(-5000);
        }
        // Emit to subscribers
        const outputData = {
            sessionId,
            type,
            data,
            timestamp: Date.now(),
        };
        const subscribers = this.subscribers.get(sessionId);
        if (subscribers) {
            for (const callback of subscribers) {
                try {
                    callback(outputData);
                }
                catch (e) {
                    console.error('[AgentProcessManager] Subscriber error:', e);
                }
            }
        }
        // Also emit on EventEmitter
        this.emit('output', outputData);
    }
    emitSystemMessage(sessionId, message) {
        const outputData = {
            sessionId,
            type: 'system',
            data: `[System] ${message}\n`,
            timestamp: Date.now(),
        };
        const subscribers = this.subscribers.get(sessionId);
        if (subscribers) {
            for (const callback of subscribers) {
                try {
                    callback(outputData);
                }
                catch (e) {
                    console.error('[AgentProcessManager] Subscriber error:', e);
                }
            }
        }
        this.emit('output', outputData);
    }
    // ============================================================================
    // Error Detection
    // ============================================================================
    detectErrors(output) {
        // Rate limit patterns
        if (/rate.?limit|too many requests|429/i.test(output)) {
            const retryMatch = output.match(/retry.?after:?\s*(\d+)/i);
            return {
                type: 'rate_limit',
                message: 'Rate limit exceeded',
                retryAfter: retryMatch ? parseInt(retryMatch[1]) * 1000 : 60000,
            };
        }
        // Auth failure patterns
        if (/unauthorized|invalid.*key|authentication.*fail|not authenticated|401/i.test(output)) {
            return {
                type: 'auth_failure',
                message: 'Authentication failed. Please check your API key or re-authenticate.',
            };
        }
        // Network error patterns
        if (/econnrefused|etimedout|network.*error|connection.*refused/i.test(output)) {
            return {
                type: 'network_error',
                message: 'Network connection failed.',
            };
        }
        return null;
    }
    // ============================================================================
    // Cleanup
    // ============================================================================
    forceKill(managedProcess) {
        if (isWindows && managedProcess.pid) {
            // Use taskkill on Windows to kill process tree
            spawn('taskkill', ['/pid', String(managedProcess.pid), '/f', '/t'], {
                shell: true,
            });
        }
        else {
            managedProcess.process.kill('SIGKILL');
        }
    }
    cleanup(sessionId) {
        this.processes.delete(sessionId);
        this.subscribers.delete(sessionId);
        console.log(`[AgentProcessManager] Cleaned up session: ${sessionId}`);
    }
}
// Export singleton instance getter
export function getAgentProcessManager() {
    return AgentProcessManager.getInstance();
}
