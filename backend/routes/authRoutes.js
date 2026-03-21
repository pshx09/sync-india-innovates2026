const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Signup flow (two-step)
router.post('/signup-request', authController.signupRequest);
router.post('/signup-verify', authController.signupVerify);

// Generic OTP verify & resend (used by Login.jsx for unverified accounts)
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);

// Standard login
router.post('/login', authController.loginUser);

// Google OAuth
router.post('/google', authController.googleLogin);

// Profile management (Authenticated)
const authenticateToken = require('../middleware/authMiddleware');
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, authController.updateProfile);

module.exports = router;
