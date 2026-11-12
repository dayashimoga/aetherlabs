'use strict';

/**
 * Legacy Adapter for CertificationEngine
 * 
 * Bridges to the isomorphic ES2024 asymmetric certification core at
 * `src/core/certificationEngine.js` while maintaining 100% backward compatibility.
 */

const core = require('../core/certificationEngine');

module.exports = {
  CertificationEngine: core.CertificationEngine
};
