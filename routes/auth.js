const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const router = express.Router();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendConfirmationEmail = require("../utils/mailer");

const generateConfirmationCode = () => {
  return crypto.randomBytes(20).toString("hex");
};

router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ msg: "Please enter all fields" });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ msg: "User already exists" });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const confirmationCode = generateConfirmationCode();

  const newUser = new User({
    username,
    email,
    password: hashedPassword,
    confirmationCode,
  });

  await newUser.save();

  sendConfirmationEmail(email, username, confirmationCode);

  res.status(201).json({
    msg: "User registered successfully. Please check your email for the confirmation code.",
  });
});

// Confirmation Route
router.post("/confirm", async (req, res) => {
  const { email, confirmationCode } = req.body;

  if (!email || !confirmationCode) {
    return res.status(400).json({ msg: "Please enter all fields" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ msg: "User does not exist" });
  }

  if (user.confirmationCode !== confirmationCode) {
    return res.status(400).json({ msg: "Invalid confirmation code" });
  }

  user.isConfirmed = true;
  user.confirmationCode = ""; // Clear the confirmation code
  await user.save();

  res.json({ msg: "User confirmed successfully" });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ msg: "Please enter all fields" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(400).json({ msg: "User does not exist" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ msg: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user._id }, "secretKey", { expiresIn: 3600 });
  res.json({ token });
});

const authMiddleware = (req, res, next) => {
  const token = req.header("access_token");
  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, "secretKey");
    req.user = decoded;
    next();
  } catch (e) {
    res.status(400).json({ msg: "Token is not valid" });
  }
};

router.get("/profile", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

module.exports = router;
