// One-off data fix: quiz submissions saved while percent was calculated as
// (score / total) * 10 have a wrong `percent`. Recompute it from score/total.
// Usage: npm run fix:quiz-percent

const dotenv = require("dotenv");
dotenv.config();

const connectDB = require("../src/config/db");
const QuizSubmission = require("../src/models/QuizSubmission");

const run = async () => {
  await connectDB();

  const submissions = await QuizSubmission.find({}, "score total percent");
  let fixed = 0;

  for (const sub of submissions) {
    const correct = sub.total > 0 ? Math.round((sub.score / sub.total) * 100) : 0;
    if (sub.percent !== correct) {
      sub.percent = correct;
      await sub.save();
      fixed++;
    }
  }

  console.log(`Checked ${submissions.length} quiz submissions, fixed ${fixed}.`);
  process.exit(0);
};

run().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
