'use strict';

/**
 * Legacy Adapter for ArchitectureEngine
 * 
 * Bridges to the isomorphic ES2024 architecture designer core at
 * `src/core/architectureEngine.js` while maintaining 100% backward compatibility.
 */

const core = require('../core/architectureEngine');

module.exports = {
  ArchitectureEngine: core.ArchitectureEngine,
  ENTERPRISE_REFERENCE_ARCHITECTURES: core.ENTERPRISE_REFERENCE_ARCHITECTURES
};
