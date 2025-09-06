/**
 * Python WebSocket Handlers - Unified wrapper for all modules
 * This file now delegates to PythonGeneralWebSocketHandlers for consistency
 */

import { PythonGeneralWebSocketHandlers } from './PythonGeneralWebSocketHandlers.js';

/**
 * Main entry point for Python WebSocket handlers
 * Delegates to the general handler that works for all modules
 * @param {Object} params - Parameters object
 * @param {Object} params.asyncapi - AsyncAPI document  
 * @param {Object} params.context - Generation context
 * @returns {string} Generated Python handlers
 */
export function PythonWebSocketHandlers({ asyncapi, context }) {
  return PythonGeneralWebSocketHandlers({ asyncapi, context });
}

export default PythonWebSocketHandlers;