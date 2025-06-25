const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const ExcelJS = require('exceljs');

// Initialize App
const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connections
const adminDB = mongoose.createConnection(
  'mongodb+srv://Daksh:thedverma1234@campus-connect.gfjrkz7.mongodb.net/Admin',
  { useNewUrlParser: true, useUnifiedTopology: true }
);

const studentDB = mongoose.createConnection(
  'mongodb+srv://Daksh:thedverma1234@campus-connect.gfjrkz7.mongodb.net/Student',
  { useNewUrlParser: true, useUnifiedTopology: true }
);

const teacherDB = mongoose.createConnection(
  'mongodb+srv://Daksh:thedverma1234@campus-connect.gfjrkz7.mongodb.net/Teacher',
  { useNewUrlParser: true, useUnifiedTopology: true }
);

// Reusable Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  university: String,
  password: String,
  role: String,
  universityKey: String,
});

// Models for each DB
const Admin = adminDB.model('Admin', userSchema);
const Student = studentDB.model('Student', userSchema);
const Teacher = teacherDB.model('Teacher', userSchema);

// Utility to get model by role
function getModelByRole(role) {
  if (role === 'admin') return Admin;
  if (role === 'student') return Student;
  if (role === 'teacher') return Teacher;
  return null;
}

// 🔐 Signup Route
app.post('/api/signup', async (req, res) => {
  try {
    const { role } = req.body;
    const Model = getModelByRole(role);

    if (!Model) return res.status(400).json({ message: 'Invalid role' });

    const existing = await Model.findOne({
      $or: [{ email: req.body.email }, { phone: req.body.phone }],
    });

    if (existing)
      return res.status(409).json({ message: 'Email or phone already registered' });

    const user = new Model(req.body);
    await user.save();

    res.status(201).json({ message: `${role} registered successfully` });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 🔐 Login Route
app.post('/api/login', async (req, res) => {
  const { loginId, password } = req.body;

  const tryLogin = async (Model) => {
    return await Model.findOne({
      $or: [{ email: loginId }, { phone: loginId }],
      password,
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

// 🔁 Multer setup to handle Excel uploads
const upload = multer({ dest: 'uploads/' });

// 📥 Upload Excel and process users using ExcelJS
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0]; // First sheet
    const users = [];

    // Read rows starting from second row (skip header)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip headers
      const [
        name,
        email,
        phone,
        university,
        password,
        role,
        universityKey
      ] = row.values.slice(1); // skip empty cell 0

      users.push({ name, email, phone, university, password, role, universityKey });
    });

    let created = { admin: 0, teacher: 0, student: 0 };

    for (const user of users) {
      const { role } = user;
      const Model = getModelByRole(role);

      if (!Model) continue;

      const existing = await Model.findOne({
        $or: [{ email: user.email }, { phone: user.phone }],
      });

      if (existing) continue;

      const newUser = new Model(user);
      await newUser.save();
      created[role] += 1;
    }

    fs.unlinkSync(filePath); // Clean up file

    res.json({
      message: 'Excel processed successfully',
      summary: created,
    });
  } catch (err) {
    console.error('Excel Upload Error:', err);
    res.status(500).json({ message: 'Failed to process Excel file' });
  }
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
