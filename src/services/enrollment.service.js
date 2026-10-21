const { isValidObjectId } = require("mongoose");
const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");
const httpError = require("../utils/httpError");

const enrollCourse = async (studentId, courseId, batchId = null) => {
  if (!isValidObjectId(courseId)) throw httpError(404, "Course not found");

  const course = await Course.findById(courseId);
  if (!course) throw httpError(404, "Course not found");

  // Check if already enrolled
  let enrollment = await Enrollment.findOne({
    student: studentId,
    course: courseId,
  });

  if (enrollment) {
    // Already enrolled, return existing enrollment
    return enrollment;
  }

  // batchId is optional, but when sent it must be one of this course's batches
  if (batchId && !course.batches.some((b) => String(b._id) === String(batchId))) {
    throw httpError(400, "Selected batch does not belong to this course");
  }

  // Create new enrollment
  enrollment = await Enrollment.create({
    student: studentId,
    course: courseId,
    batchId: batchId || null,
    progress: { completedLessons: [], percent: 0 },
  });

  return enrollment;
};

const getMyEnrollments = async (studentId) => {
  const enrollments = await Enrollment.find({ student: studentId })
    .populate("course", "title instructorName price category tags")
    .sort({ createdAt: -1 });

  // hide enrollments whose course no longer exists
  return enrollments.filter((e) => e.course);
};

const completeLesson = async (enrollId, lessonId, studentId) => {
  if (!isValidObjectId(enrollId)) throw httpError(404, "Enrollment not found");

  const enrollment = await Enrollment.findById(enrollId);
  // students may only update their own progress
  if (!enrollment || String(enrollment.student) !== String(studentId)) {
    throw httpError(404, "Enrollment not found");
  }

  const course = await Course.findById(enrollment.course);
  if (!course) throw httpError(404, "Course not found");

  const lessonIds = course.syllabus.flatMap((mod) => mod.lessons.map((l) => String(l._id)));
  if (!lessonId || !lessonIds.includes(String(lessonId))) {
    throw httpError(400, "Lesson does not belong to this course");
  }

  // avoid duplicates
  const alreadyDone = enrollment.progress.completedLessons
    .map(String)
    .includes(String(lessonId));

  if (!alreadyDone) {
    enrollment.progress.completedLessons.push(lessonId);
  }

  // calculate percent from lessons that still exist in the course
  const totalLessons = lessonIds.length;
  const completed = enrollment.progress.completedLessons.filter((id) =>
    lessonIds.includes(String(id))
  ).length;
  enrollment.progress.percent =
    totalLessons === 0 ? 0 : Math.round((completed / totalLessons) * 100);

  await enrollment.save();
  return enrollment;
};

module.exports = { enrollCourse, getMyEnrollments, completeLesson };
