const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// App initialization
const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(
  'mongodb+srv://Daksh:thedverma1234@campus-connect.gfjrkz7.mongodb.net/campusconnect?retryWrites=true&w=majority',
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
).then(() => console.log('✅ Connected to MongoDB Atlas'))
 .catch(err => console.error('❌ MongoDB connection error:', err));

// Define User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  university: String,
  password: String,
  role: String,
  universityKey: String,
});

const User = mongoose.model('User', userSchema);

// Signup Route
app.post('/api/signup', async (req, res) => {
  try {
    const existing = await User.findOne({
      $or: [{ email: req.body.email }, { phone: req.body.phone }],
    });

    if (existing) {
      return res.status(409).json({ message: 'Email or phone already registered' });
    }

    const user = new User(req.body);
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login Route (Optional)
app.post('/api/login', async (req, res) => {
  const { loginId, password } = req.body;
  const user = await User.findOne({
    $or: [{ email: loginId }, { phone: loginId }],
    password,
  });

  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  res.json({ message: 'Login successful', user });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running at http://localhost:${PORT}`);
});
