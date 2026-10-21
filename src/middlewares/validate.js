// middleware to validate request bodies against Zod schemas

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    // Zod 4 exposes problems on `issues` (the old `errors` alias was removed)
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return res.status(400).json({
      message: errors.map((e) => e.message).join(". "),
      errors,
    });
  }
  req.body = result.data;
  next();
};

module.exports = validate;
