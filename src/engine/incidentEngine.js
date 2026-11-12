'use strict';

/**
 * Legacy Adapter for IncidentEngine
 * 
 * Bridges to the isomorphic ES2024 unified incident simulation core at
 * `src/core/incidentEngine.js` while maintaining 100% backward compatibility.
 */

const core = require('../core/incidentEngine');

module.exports = {
  IncidentEngine: core.IncidentEngine,
  INCIDENT_SCENARIOS: core.INCIDENT_SCENARIOS,
  CATEGORY_WEBSITE_DOWN: core.CATEGORY_WEBSITE_DOWN,
  CATEGORY_POD_RESTARTING: core.CATEGORY_POD_RESTARTING,
  CATEGORY_SLOW_APP: core.CATEGORY_SLOW_APP,
  CATEGORY_DNS_OUTAGE: core.CATEGORY_DNS_OUTAGE,
  CATEGORY_IAM_OUTAGE: core.CATEGORY_IAM_OUTAGE,
  CATEGORY_STORAGE_OUTAGE: core.CATEGORY_STORAGE_OUTAGE,
  CATEGORY_NETWORKING_OUTAGE: core.CATEGORY_NETWORKING_OUTAGE,
  CATEGORY_NODE_OUTAGE: core.CATEGORY_NODE_OUTAGE,
  INCIDENT_CATEGORIES: core.INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_METADATA: core.INCIDENT_CATEGORY_METADATA
};
