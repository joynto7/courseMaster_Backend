// service to handle course-related operations

const { isValidObjectId } = require("mongoose");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const httpError = require("../utils/httpError");

// lesson fields that only admins and enrolled students may receive
const PROTECTED_LESSON_FIELDS = ["videoUrl", "liveClassLink", "liveClassDate", "assignmentPrompt", "quiz"];
const PUBLIC_COURSE_PROJECTION = PROTECTED_LESSON_FIELDS.map((f) => `-syllabus.lessons.${f}`).join(" ");

// treat user input as literal text inside a regular expression
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCourses = async (query, viewer) => {
  const {
    page = 1,
    limit = 8,
    search = "",
    sort = "",
    category,
    tags,
  } = query;

  // Validate and sanitize pagination parameters
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 8)); // Max 100 items per page

  const filter = {};

  if (search && typeof search === "string" && search.trim()) {
    const pattern = escapeRegex(search.trim());
    filter.$or = [
      { title: { $regex: pattern, $options: "i" } },
      { instructorName: { $regex: pattern, $options: "i" } },
    ];
  }

  if (category && typeof category === "string" && category.trim()) {
    filter.category = { $regex: escapeRegex(category.trim()), $options: "i" };
  }

  if (tags && typeof tags === "string") {
    const tagArray = tags.split(",").map(t => t.trim()).filter(t => t); // "mern,react"
    if (tagArray.length > 0) {
      filter.tags = { $in: tagArray.map((t) => new RegExp(`^${escapeRegex(t)}$`, "i")) };
    }
  }

  let sortObj = {};
  if (sort === "price_asc") sortObj.price = 1;
  if (sort === "price_desc") sortObj.price = -1;

  const skip = (pageNum - 1) * limitNum;

  const coursesQuery = Course.find(filter)
    .sort(sortObj)
    .skip(skip)
    .limit(limitNum);

  // the catalogue only needs module/lesson titles; admins manage the full content
  if (viewer?.role !== "admin") coursesQuery.select(PUBLIC_COURSE_PROJECTION);

  const [courses, total] = await Promise.all([
    coursesQuery,
    Course.countDocuments(filter),
  ]);

  return {
    courses,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  };
};

const getCourseById = async (id, viewer) => {
  if (!isValidObjectId(id)) throw httpError(404, "Course not found");

  const course = await Course.findById(id);
  if (!course) throw httpError(404, "Course not found");

  const canViewContent =
    viewer?.role === "admin" ||
    (viewer && (await Enrollment.exists({ student: viewer.id, course: id })));
  if (canViewContent) return course;

  // visitors and non-enrolled students only see the outline
  const outline = course.toObject();
  outline.syllabus = outline.syllabus.map((mod) => ({
    ...mod,
    lessons: mod.lessons.map(({ _id, title }) => ({ _id, title })),
  }));
  return outline;
};

module.exports = { getCourses, getCourseById };
