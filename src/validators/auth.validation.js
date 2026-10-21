// validation schemas for authentication

const { z } = require("zod");

const email = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address");

const registerSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters"),
  email,
  password: z
    .string({ error: "Password is required" })
    .min(6, "Password must be at least 6 characters"),
  adminKey: z.string().optional(), // Optional admin registration key
});

const loginSchema = z.object({
  email,
  password: z
    .string({ error: "Password is required" })
    .min(6, "Password must be at least 6 characters"),
});

module.exports = { registerSchema, loginSchema };
