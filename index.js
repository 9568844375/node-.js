// Load environment variables from a .env file into process.env
require('dotenv').config();

// Import required packages
const express = require('express'); // Framework for creating the server and handling routes
const mongoose = require('mongoose'); // ODM (Object Data Modeling) tool for MongoDB
const cors = require('cors'); // Allows cross-origin requests (important for frontend-backend connection)
const multer = require('multer'); // Middleware to handle file uploads (used for Excel)
const fs = require('fs'); // Node.js file system module (used to delete uploaded files)
const ExcelJS = require('exceljs'); // Library to read/write Excel files

// Initialize the Express application
const app = express();

// Middleware to allow CORS (frontend on different domain/port)
app.use(cors());

// Middleware to parse incoming JSON requests
app.use(express.json());

// ---------------------- DATABASE CONNECTIONS ---------------------- //

// Connect to the Admin database
const adminDB = mongoose.createConnection(process.env.ADMIN_DB_URI);

// Connect to the Student database
const studentDB = mongoose.createConnection(process.env.STUDENT_DB_URI);

// Connect to the Teacher database
const teacherDB = mongoose.createConnection(process.env.TEACHER_DB_URI);

// ---------------------- SCHEMA DEFINITION ---------------------- //

// Define a reusable schema for all user roles
const userSchema = new mongoose.Schema({
  name: String, // User's name
  email: String, // Email address
  phone: String, // Contact number
  university: String, // University name
  password: String, // Plain password (you can hash it later)
  role: String, // 'admin', 'teacher', or 'student'
  universityKey: String, // Custom university identifier

  // Relationship fields
  accessToStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }], // For Admins/Teachers to access students
  accessToTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }], // For Admins to access teachers
});

// ---------------------- MODELS ---------------------- //

// Create Mongoose models for each role using separate DBs
const Admin = adminDB.model('Admin', userSchema);
const Student = studentDB.model('Student', userSchema);
const Teacher = teacherDB.model('Teacher', userSchema);

// ---------------------- UTILITY FUNCTION ---------------------- //

// Returns the appropriate model based on user role
function getModelByRole(role) {
  if (role === 'admin') return Admin;
  if (role === 'student') return Student;
  if (role === 'teacher') return Teacher;
  return null;
}

// ---------------------- API: SIGNUP ---------------------- //

// Endpoint to register a new user
app.post('/api/signup', async (req, res) => {
  try {
    const { role } = req.body; // Get role from request
    const Model = getModelByRole(role); // Get corresponding model

    if (!Model) return res.status(400).json({ message: 'Invalid role' });

    // Check if user with same email or phone exists
    const existing = await Model.findOne({
      $or: [{ email: req.body.email }, { phone: req.body.phone }],
    });

    if (existing)
      return res.status(409).json({ message: 'Email or phone already registered' });

    // Create and save user
    const user = new Model(req.body);
    await user.save();

    res.status(201).json({ message: `${role} registered successfully` });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------- API: LOGIN ---------------------- //

// Endpoint to login user
app.post('/api/login', async (req, res) => {
  const { loginId, password } = req.body;

  // Try logging in through each role model
  const tryLogin = async (Model) => {
    return await Model.findOne({
      $or: [{ email: loginId }, { phone: loginId }],
      password, // In real apps, use hashed password comparison
    });
  };

  try {
    const user =
      (await tryLogin(Admin)) ||
      (await tryLogin(Student)) ||
      (await tryLogin(Teacher));

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({ message: 'Login successful', user });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------- EXCEL UPLOAD ---------------------- //

// Setup Multer to store uploaded files temporarily in 'uploads/' folder
const upload = multer({ dest: 'uploads/' });

// Route to handle Excel file upload and user creation
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;

    // Create workbook instance and read uploaded Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0]; // Use the first sheet
    const users = [];

    // Loop through rows (skipping the header row)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const [
        name,
        email,
        phone,
        university,
        password,
        role,
        universityKey
      ] = row.values.slice(1); // Skip first empty cell

      users.push({ name, email, phone, university, password, role, universityKey });
    });

    // Counter for created users by role
    let created = { admin: 0, teacher: 0, student: 0 };

    // Loop through users, skip existing ones, save new ones
    for (const user of users) {
      const Model = getModelByRole(user.role);
      if (!Model) continue;

      const existing = await Model.findOne({
        $or: [{ email: user.email }, { phone: user.phone }],
      });

      if (existing) continue;

      const newUser = new Model(user);
      await newUser.save();
      created[user.role] += 1;
    }

    // Delete the temporary uploaded file
    fs.unlinkSync(filePath);

    res.json({
      message: 'Excel processed successfully',
      summary: created,
    });
  } catch (err) {
    console.error('Excel Upload Error:', err);
    res.status(500).json({ message: 'Failed to process Excel file' });
  }
});

// ---------------------- ADMIN ACCESS ROUTE ---------------------- //

// Get all teachers and students that an Admin can access
app.get('/api/admin/:id/access', async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id)
      .populate('accessToTeachers') // Populates teachers' data
      .populate('accessToStudents'); // Populates students' data

    if (!admin) return res.status(404).json({ message: 'Admin not found' });

    res.json(admin);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------- TEACHER STUDENT ACCESS ---------------------- //

// Get all students that a Teacher has access to
app.get('/api/teacher/:id/students', async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id)
      .populate('accessToStudents'); // Populates students' data

    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    res.json(teacher);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------- START SERVER ---------------------- //

// Start listening on a given port (default: 5000)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
