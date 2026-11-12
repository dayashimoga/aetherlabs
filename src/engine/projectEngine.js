'use strict';

/**
 * Legacy Adapter for ProjectEngine
 * 
 * Bridges to the isomorphic ES2024 unified capstone project core at
 * `src/core/projectEngine.js` while maintaining 100% backward compatibility.
 */

const core = require('../core/projectEngine');

module.exports = {
  ProjectEngine: core.ProjectEngine,
  CAPSTONE_PROJECTS: core.CAPSTONE_PROJECTS
};
