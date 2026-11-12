'use strict';

/**
 * Legacy Adapter for AiMentor
 * 
 * Bridges to the isomorphic ES2024 contextual AI mentor core at
 * `src/core/aiMentor.js` while maintaining 100% backward compatibility.
 */

const core = require('../core/aiMentor');

module.exports = {
  AiMentor: core.AiMentor
};
