#!/usr/bin/env node
/**
 * Standalone health check: verifies API and database connectivity.
 * Run: node scripts/health-check.js
 */

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function healthCheck() {
  try {
    console.log(`Checking health at ${API_URL}/health...`);
    const response = await axios.get(`${API_URL}/health`);

    console.log('✓ API Status:', response.data.status);
    console.log('✓ Database Connected:', response.data.database.connected);

    if (response.data.database.connected) {
      console.log('✓ Database Timestamp:', response.data.database.timestamp);
    }

    process.exit(0);
  } catch (err) {
    console.error('✗ Health check failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

healthCheck();
