// route definitions for course-related endpoints

const router = require("express").Router();
const courseController = require("../controllers/course.controller");
const { optionalAuth } = require("../middlewares/authMiddleware");

// public, but admins / enrolled students receive the full lesson content
router.get("/", optionalAuth, courseController.getCourses);
router.get("/:id", optionalAuth, courseController.getCourseById);

module.exports = router;
