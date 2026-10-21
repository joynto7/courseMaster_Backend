// service to handle admin-related operations

const { isValidObjectId } = require("mongoose");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const QuizSubmission = require("../models/QuizSubmission");
const User = require("../models/User");
const httpError = require("../utils/httpError");

const createCourse = async (payload) => {
  const course = await Course.create(payload);
  return course;
};

const updateCourse = async (id, payload) => {
  if (!isValidObjectId(id)) throw httpError(404, "Course not found");

  let course;
  try {
    // run schema validators so required fields / min price are enforced on updates too
    course = await Course.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  } catch (err) {
    throw httpError(400, err.message);
  }
  if (!course) throw httpError(404, "Course not found");
  return course;
};

const deleteCourse = async (id) => {
  if (!isValidObjectId(id)) throw httpError(404, "Course not found");

  const course = await Course.findByIdAndDelete(id);
  if (!course) throw httpError(404, "Course not found");

  // remove data that only makes sense while the course exists
  await Promise.all([
    Enrollment.deleteMany({ course: id }),
    AssignmentSubmission.deleteMany({ course: id }),
    QuizSubmission.deleteMany({ course: id }),
  ]);

  return { message: "Course deleted" };
};

// ✅ NEW: get enrollments (with optional filters)
const getEnrollments = async (query) => {
  const { courseId, batchId } = query;

  const filter = {};
  if (courseId) filter.course = courseId;
  if (batchId) filter.batchId = batchId;

  return Enrollment.find(filter)
    .populate("student", "name email")
    .populate("course", "title instructorName")
    .sort({ createdAt: -1 });
};

// ✅ NEW: get all assignment submissions (optionally filtered by ?courseId=)
const getAssignments = async (query = {}) => {
  const filter = {};
  if (query.courseId) {
    if (!isValidObjectId(query.courseId)) throw httpError(400, "Invalid courseId");
    filter.course = query.courseId; // the schema field is `course`
  }

  const submissions = await AssignmentSubmission.find(filter)
    .populate("student", "name email")
    .populate("course", "title syllabus")
    .populate("reviewer", "name")
    .sort({ createdAt: -1 });

  // Add lesson title to each submission
  const submissionsWithLessonTitle = submissions.map((sub) => {
    const submissionObj = sub.toObject();
    let lessonTitle = "Unknown Lesson";

    if (sub.course && sub.course.syllabus) {
      for (const module of sub.course.syllabus) {
        for (const lesson of module.lessons || []) {
          if (String(lesson._id) === String(sub.lessonId)) {
            lessonTitle = lesson.title;
            submissionObj.assignmentPrompt = lesson.assignmentPrompt || "";
            break;
          }
        }
        if (lessonTitle !== "Unknown Lesson") break;
      }
    }

    submissionObj.lessonTitle = lessonTitle;
    return submissionObj;
  });

  return submissionsWithLessonTitle;
};

// review/update an assignment submission (admin)
const reviewAssignment = async (id, payload, adminId) => {
  const { reviewNotes, grade, status } = payload;

  if (typeof status !== "undefined" && !["submitted", "reviewed"].includes(status)) {
    throw httpError(400, "Status must be 'submitted' or 'reviewed'");
  }
  if (
    typeof grade !== "undefined" &&
    grade !== null &&
    (typeof grade !== "number" || !Number.isFinite(grade) || grade < 0 || grade > 100)
  ) {
    throw httpError(400, "Grade must be a number between 0 and 100");
  }

  const update = {};
  if (typeof status !== "undefined") update.status = status;
  if (typeof reviewNotes !== "undefined") update.reviewNotes = reviewNotes;
  if (typeof grade !== "undefined") update.grade = grade;
  if (adminId) update.reviewer = adminId;

  if (!isValidObjectId(id)) throw httpError(404, "Submission not found");

  const submission = await AssignmentSubmission.findByIdAndUpdate(id, update, { new: true })
    .populate("student", "name email")
    .populate("course", "title")
    .populate("reviewer", "name");

  if (!submission) throw httpError(404, "Submission not found");

  return submission;
};

// Get analytics data for dashboard
const getAnalytics = async () => {
  // Get enrollments grouped by date (last 30 days, today included).
  // All day boundaries are UTC so they match the ISO date keys below,
  // regardless of the server's local timezone.
  const now = new Date();
  const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));

  const enrollments = await Enrollment.find({
    createdAt: { $gte: firstDay }
  }).sort({ createdAt: 1 });

  // Group by date
  const enrollmentData = {};
  enrollments.forEach(enrollment => {
    const date = enrollment.createdAt.toISOString().split('T')[0];
    enrollmentData[date] = (enrollmentData[date] || 0) + 1;
  });

  // Convert to array format for chart (last 30 days)
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const chartData = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(firstDay);
    date.setUTCDate(firstDay.getUTCDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    // Format date for display (e.g., "Jan 15")
    const displayDate = `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}`;

    chartData.push({
      date: dateStr,
      displayDate: displayDate,
      enrollments: enrollmentData[dateStr] || 0
    });
  }

  // Get total stats
  const totalEnrollments = await Enrollment.countDocuments();
  const totalCourses = await Course.countDocuments();
  const totalStudents = await User.countDocuments({ role: "student" });
  const totalInstructors = await User.countDocuments({ role: "admin" }); // Assuming admins are instructors

  // Get enrollments by course (top 5)
  const enrollmentsByCourse = await Enrollment.aggregate([
    {
      $group: {
        _id: "$course",
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 5
    },
    {
      $lookup: {
        from: "courses",
        localField: "_id",
        foreignField: "_id",
        as: "courseInfo"
      }
    },
    {
      $unwind: "$courseInfo"
    },
    {
      $project: {
        courseName: "$courseInfo.title",
        enrollments: "$count"
      }
    }
  ]);

  return {
    chartData,
    enrollmentsByCourse,
    stats: {
      totalEnrollments,
      totalCourses,
      totalStudents,
      totalInstructors,
      enrollmentsLast30Days: enrollments.length
    }
  };
};

module.exports = {
  createCourse,
  updateCourse,
  deleteCourse,
  getEnrollments,
  getAssignments,
  reviewAssignment,
  getAnalytics,
};
