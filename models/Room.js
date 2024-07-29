const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  name: String,
  users: [{ socketId: String, name: String, user_id: String }],
  questions: [{ question: String, answer: String, options: Array }],
});

module.exports = mongoose.model("Room", roomSchema);
