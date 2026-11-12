'use strict';

/**
 * KubeLabs v3.0 - Validation Engine Bridge
 * Delegates to the unified isomorphic core ValidationEngine in src/core/validationEngine.js.
 */
const { ValidationEngine, getFieldByPath, compareValues } = require('../core/validationEngine');

module.exports = {
  ValidationEngine,
  getFieldByPath,
  compareValues
};
