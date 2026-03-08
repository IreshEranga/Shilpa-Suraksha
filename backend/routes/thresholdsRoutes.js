const express = require('express');
const router = express.Router();
const { getThresholds, recalculateThresholds } = require('../ml/thresholdCalculator');

/**
 * GET /api/thresholds
 * Get current thresholds (from cache or calculate)
 */
router.get('/', async (req, res) => {
  try {
    const thresholds = await getThresholds();
    res.json({
      success: true,
      thresholds,
      message: 'Current thresholds retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting thresholds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve thresholds',
      error: error.message
    });
  }
});

/**
 * POST /api/thresholds/recalculate
 * Force recalculation of thresholds from current data
 */
router.post('/recalculate', async (req, res) => {
  try {
    const thresholds = await recalculateThresholds();
    res.json({
      success: true,
      thresholds,
      message: 'Thresholds recalculated successfully from current data'
    });
  } catch (error) {
    console.error('Error recalculating thresholds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate thresholds',
      error: error.message
    });
  }
});

module.exports = router;