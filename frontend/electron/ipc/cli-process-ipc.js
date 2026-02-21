// ============================================================================
// IPC Handlers - CLI Process Management & Output Streaming
// ============================================================================
import { ipcMain } from 'electron';
import { getAgentProcessManager } from '../services/agent-process-manager.js';
// ============================================================================
// Module State
// ============================================================================
// Map to track output subscriptions per webContents
const outputSubscriptions = new Map();
// ============================================================================
// Registration
// ============================================================================
export function registerCLIProcessIPC() {
    // --------------------------------------------------------------------------
    // Process Management
    // --------------------------------------------------------------------------
    ipcMain.handle('cli:start', async (_, config) => {
        console.log('[IPC] cli:start called', config);
        const manager = getAgentProcessManager();
        return manager.startCLI(config);
    });
    ipcMain.handle('cli:stop', async (_, sessionId) => {
        console.log(`[IPC] cli:stop called for ${sessionId}`);
        const manager = getAgentProcessManager();
        return manager.stopCLI(sessionId);
    });
    ipcMain.handle('cli:status', async (_, sessionId) => {
        const manager = getAgentProcessManager();
        return manager.getStatus(sessionId);
    });
    ipcMain.handle('cli:sessions', async () => {
        const manager = getAgentProcessManager();
        return manager.getActiveSessions();
    });
    ipcMain.handle('cli:send-input', async (_, sessionId, input) => {
        const manager = getAgentProcessManager();
        return manager.sendInput(sessionId, input);
    });
    // --------------------------------------------------------------------------
    // Output Streaming
    // --------------------------------------------------------------------------
    ipcMain.on('cli:subscribe', (event, sessionId) => {
        console.log(`[IPC] cli:subscribe called for ${sessionId}`);
        const webContentsId = event.sender.id;
        const manager = getAgentProcessManager();
        // Get or create subscription map for this webContents
        let subscriptions = outputSubscriptions.get(webContentsId);
        if (!subscriptions) {
            subscriptions = new Map();
            outputSubscriptions.set(webContentsId, subscriptions);
        }
        // Unsubscribe from previous subscription for this session if exists
        const existingUnsubscribe = subscriptions.get(sessionId);
        if (existingUnsubscribe) {
            existingUnsubscribe();
        }
        // Subscribe to output
        const unsubscribe = manager.onOutput(sessionId, (data) => {
            try {
                if (!event.sender.isDestroyed()) {
                    event.sender.send('cli:output', data);
                }
            }
            catch (e) {
                console.error('[IPC] Failed to send output:', e);
            }
        });
        subscriptions.set(sessionId, unsubscribe);
    });
    ipcMain.on('cli:unsubscribe', (event, sessionId) => {
        console.log(`[IPC] cli:unsubscribe called for ${sessionId}`);
        const webContentsId = event.sender.id;
        const subscriptions = outputSubscriptions.get(webContentsId);
        if (subscriptions) {
            const unsubscribe = subscriptions.get(sessionId);
            if (unsubscribe) {
                unsubscribe();
                subscriptions.delete(sessionId);
            }
        }
    });
}
