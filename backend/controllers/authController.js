const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const db = require('../config/db');

// In-memory store for pending signups (Email -> { formData, otp, expiresAt })
const otpStore = new Map();

// Helper: Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// NodeMailer Transporter — initialized lazily to ensure .env is loaded
let _transporter = null;
function getTransporter() {
    if (!_transporter) {
        console.log("[Nodemailer] Creating transporter with user:", process.env.EMAIL_USER);
        _transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            connectionTimeout: 10000,  // 10s connection timeout
            greetingTimeout: 10000,    // 10s greeting timeout
            socketTimeout: 15000       // 15s socket timeout
        });
    }
    return _transporter;
}

// ============================================================
// 1. SIGNUP REQUEST: Save details in memory + Send OTP via email
// ============================================================
exports.signupRequest = async (req, res) => {
    try {
        console.log("📥 Incoming Signup Payload:", JSON.stringify(req.body));
        
        const { name, email, password, phone, role, department, address, city } = req.body;
        
        // RELAXED validation: only name, email, password are strictly required
        if (!name || !email || !password) {
            console.log("❌ Signup rejected: Missing name, email, or password");
            return res.status(400).json({ 
                error: "Name, email, and password are required.",
                received: { name: !!name, email: !!email, password: !!password }
            });
        }

        // Check if user already exists in DB
        const userExist = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExist.rows.length > 0) {
            console.log("❌ Signup rejected: Email already exists:", email);
            return res.status(400).json({ error: "Email already registered. Please login." });
        }

        const otp = generateOTP();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Store in memory
        otpStore.set(email, {
            formData: { name, email, password, phone: phone || '', role: role || 'citizen', department, address, city },
            otp,
            expiresAt
        });

        console.log("📧 Attempting to send OTP to:", email);
        console.log("🔑 Generated OTP:", otp);

        const mailOptions = {
            from: `"Nagar Alert Hub" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Verify your Nagar Alert Hub Account',
            text: `Your verification code is: ${otp}. It expires in 10 minutes. Welcome to Nagar Alert Hub!`
        };

        try {
            const transporter = getTransporter();
            await transporter.sendMail(mailOptions);
            console.log("✅ OTP email sent successfully to:", email);
            return res.status(200).json({ message: "OTP sent to your email.", email });
        } catch (mailError) {
            console.error("❌ Nodemailer Error:", mailError.message);
            // STILL return 200 — OTP is stored in memory, user can see it in console for dev
            return res.status(200).json({ 
                message: "OTP generated (email delivery may have failed — check server console for OTP).",
                email,
                otp_debug: otp  // Send back for dev testing
            });
        }

    } catch (error) {
        console.error("❌ Signup Request Error:", error);
        return res.status(500).json({ error: "Server error during signup request" });
    }
};

// ============================================================
// 2. SIGNUP VERIFY: Check OTP + Create User in DB + Return JWT
// ============================================================
exports.signupVerify = async (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log("📥 Verify OTP request for:", email, "with OTP:", otp);
        
        if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

        const pendingUser = otpStore.get(email);
        if (!pendingUser) return res.status(400).json({ error: "Verification session expired. Please sign up again." });

        if (pendingUser.otp !== otp) return res.status(400).json({ error: "Invalid verification code." });

        if (Date.now() > pendingUser.expiresAt) {
            otpStore.delete(email);
            return res.status(400).json({ error: "OTP has expired. Please sign up again." });
        }

        // OTP Valid -> Hash Password and Create User
        const { formData } = pendingUser;
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(formData.password, salt);
        
        // Split name for first_name / last_name columns
        const nameParts = formData.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const insertQuery = `
            INSERT INTO users (email, password_hash, first_name, last_name, name, phone, role, department, address, city, is_verified)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE) RETURNING *;
        `;
        
        const result = await db.query(insertQuery, [
            formData.email, passwordHash, firstName, lastName, formData.name,
            formData.phone, formData.role || 'citizen', formData.department, 
            formData.address, formData.city
        ]);
        
        const user = result.rows[0];
        otpStore.delete(email); // Cleanup

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, department: user.department || null },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        console.log("✅ User created & verified:", user.email, "| dept:", user.department);
        return res.status(201).json({
            message: "Account created and verified!",
            token,
            role: user.role || 'citizen',
            user: { id: user.id, email: user.email, role: user.role, name: user.name, department: user.department }
        });

    } catch (error) {
        console.error("❌ Signup Verify Error:", error);
        return res.status(500).json({ error: "Final registration failed", details: error.message });
    }
};

// ============================================================
// 3. VERIFY OTP (Generic — used by Login.jsx for unverified accounts)
// ============================================================
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

        // Check otpStore first (for pending signups)
        const pendingUser = otpStore.get(email);
        if (pendingUser) {
            // Delegate to signupVerify logic
            return exports.signupVerify(req, res);
        }

        // Otherwise check the database for existing unverified users
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user) return res.status(400).json({ error: "User not found" });

        if (user.verification_otp !== otp) return res.status(400).json({ error: "Invalid verification code." });
        if (user.otp_expires_at && new Date(user.otp_expires_at) < new Date()) {
            return res.status(400).json({ error: "OTP expired. Please request a new one." });
        }

        // Mark as verified
        await db.query('UPDATE users SET is_verified = TRUE, verification_otp = NULL, otp_expires_at = NULL WHERE id = $1', [user.id]);

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, department: user.department || null },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        return res.status(200).json({ token, role: user.role, user: { id: user.id, email: user.email, role: user.role, name: user.name, department: user.department } });
    } catch (error) {
        console.error("❌ Verify OTP Error:", error);
        return res.status(500).json({ error: "Verification failed" });
    }
};

// ============================================================
// 4. RESEND OTP (for both signup and login verification)
// ============================================================
exports.resendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email required" });

        // Check otpStore first (pending signup)
        const pending = otpStore.get(email);
        if (pending) {
            const newOtp = generateOTP();
            pending.otp = newOtp;
            pending.expiresAt = Date.now() + 10 * 60 * 1000;
            console.log("🔑 Resend OTP (signup):", newOtp, "for:", email);

            try {
                const transporter = getTransporter();
                await transporter.sendMail({
                    from: `"Nagar Alert Hub" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: 'New Verification Code - Nagar Alert Hub',
                    text: `Your new verification code is: ${newOtp}. It expires in 10 minutes.`
                });
                return res.status(200).json({ message: "New OTP sent." });
            } catch (mailError) {
                console.error("❌ Resend mail error:", mailError.message);
                return res.status(200).json({ message: "OTP regenerated (check server console).", otp_debug: newOtp });
            }
        }

        // Check DB for existing user
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (!user) return res.status(400).json({ error: "User not found" });

        const newOtp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await db.query('UPDATE users SET verification_otp = $1, otp_expires_at = $2 WHERE id = $3', [newOtp, expiresAt, user.id]);
        console.log("🔑 Resend OTP (login):", newOtp, "for:", email);

        try {
            const transporter = getTransporter();
            await transporter.sendMail({
                from: `"Nagar Alert Hub" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'New Verification Code - Nagar Alert Hub',
                text: `Your new verification code is: ${newOtp}. It expires in 10 minutes.`
            });
            return res.status(200).json({ message: "New OTP sent." });
        } catch (mailError) {
            console.error("❌ Resend mail error:", mailError.message);
            return res.status(200).json({ message: "OTP regenerated (check server console).", otp_debug: newOtp });
        }

    } catch (error) {
        console.error("❌ Resend OTP Error:", error);
        return res.status(500).json({ error: "Resend failed" });
    }
};

// ============================================================
// 5. LOGIN USER: Standard password flow
// ============================================================
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("🔐 Login attempt for:", email);
        if (!email || !password) return res.status(400).json({ error: "Email and password required" });

        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || !user.password_hash) {
            console.log("❌ Login failed: user not found or no password_hash for:", email);
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            console.log("❌ Login failed: password mismatch for:", email);
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, department: user.department || null },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        console.log("✅ Login SUCCESS for:", user.email, "| role:", user.role, "| dept:", user.department);
        return res.status(200).json({
            message: "Login successful",
            token,
            role: user.role || 'citizen',
            user: { id: user.id, email: user.email, role: user.role, name: user.name, department: user.department }
        });
    } catch (error) {
        console.error("❌ Login Error:", error);
        return res.status(500).json({ error: "Login failed" });
    }
};

// ============================================================
// 6. GOOGLE LOGIN: Pre-Verified
// ============================================================
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await db.query('SELECT id, email, name, first_name as "firstName", last_name as "lastName", phone, address, city, role, profile_pic as "profilePic", points FROM users WHERE id = $1', [userId]);
        
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
        
        res.status(200).json({ user: result.rows[0] });
    } catch (error) {
        console.error("❌ Get Profile Error:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { firstName, lastName, phone, address, profilePic } = req.body;
        
        const updateQuery = `
            UPDATE users 
            SET first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                phone = COALESCE($3, phone),
                address = COALESCE($4, address),
                profile_pic = COALESCE($5, profile_pic),
                name = COALESCE($1 || ' ' || $2, name)
            WHERE id = $6
            RETURNING id, email, name, first_name as "firstName", last_name as "lastName", phone, address, city, role, profile_pic as "profilePic", points;
        `;
        
        const result = await db.query(updateQuery, [firstName, lastName, phone, address, profilePic, userId]);
        
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
        
        res.status(200).json({ 
            message: "Profile updated successfully!",
            user: result.rows[0] 
        });
    } catch (error) {
        console.error("❌ Update Profile Error:", error);
        res.status(500).json({ error: "Failed to update profile", details: error.message });
    }
};

exports.googleLogin = async (req, res) => {
    try {
        const { email, name, google_id } = req.body;
        let result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        let user = result.rows[0];

        if (!user) {
            const insertResult = await db.query(
                'INSERT INTO users (email, name, google_id, is_verified) VALUES ($1, $2, $3, TRUE) RETURNING *',
                [email, name, google_id]
            );
            user = insertResult.rows[0];
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );
        return res.status(200).json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
    } catch (error) {
        console.error("❌ Google Login Error:", error);
        return res.status(500).json({ error: "Google login failed" });
    }
};