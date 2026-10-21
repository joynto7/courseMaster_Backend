// middleware to authenticate JWT tokens

const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verifies the Bearer token and loads the user so that bans, role changes and
// deleted accounts take effect immediately instead of when the token expires.
// Returns { user } on success or { status, message } on failure.
const resolveUser = async (header) => {
  if (!header || !header.startsWith("Bearer ")) {
    return { status: 401, message: "Not authorized" };
  }

  const token = header.slice(7).trim();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { status: 401, message: "Invalid or expired token" };
  }

  const user = await User.findById(decoded.id).select("role isBanned").lean();
  if (!user) return { status: 401, message: "User no longer exists" };
  if (user.isBanned) return { status: 403, message: "Your account has been banned" };

  return { user: { id: String(user._id), role: user.role } };
};

const authMiddleware = async (req, res, next) => {
  try {
    const { user, status, message } = await resolveUser(req.headers.authorization);
    if (!user) return res.status(status).json({ message });
    req.user = user; // { id, role }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Attaches req.user when a valid token is sent, but never blocks the request.
// Used by public routes that return extra data to signed-in users.
const optionalAuth = async (req, res, next) => {
  try {
    const { user } = await resolveUser(req.headers.authorization);
    if (user) req.user = user;
  } catch {
    // treat as anonymous
  }
  next();
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuth;
